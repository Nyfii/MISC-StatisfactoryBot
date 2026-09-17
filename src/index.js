const { Client, Events, GatewayIntentBits } = require("discord.js");
const appConfig = require("../apps.json");
require("dotenv").config();

const DAILY_CHECK_HOUR_UTC = 6;
const ERROR_MESSAGE = "Error checking the Steam page. Please try again later.";
const apps = Object.entries(appConfig).map(([name, appId]) => ({
    appId,
    displayName: formatAppName(name),
    command: `/${name.toLowerCase()}`,
}));
const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token) {
    throw new Error("DISCORD_TOKEN is required. Add it to a local .env file.");
}

if (!channelId) {
    throw new Error("DISCORD_CHANNEL_ID is required. Add it to a local .env file.");
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

function formatAppName(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

async function getAppDiscount(app) {
    const params = new URLSearchParams({
        appids: String(app.appId),
        filters: "price_overview",
    });

    const response = await fetch(
        `https://store.steampowered.com/api/appdetails?${params}`,
    );

    if (!response.ok) {
        throw new Error(`Steam API responded with ${response.status}`);
    }

    const appDetails = await response.json();
    const details = appDetails[String(app.appId)];

    if (!details?.success) {
        throw new Error(
            `Steam API did not return ${app.displayName} price details`,
        );
    }

    return details.data?.price_overview ?? null;
}

function formatAppDiscount(app, priceOverview) {
    if (!priceOverview) {
        return `I couldn't find current Steam pricing for ${app.displayName}.`;
    }

    if (!priceOverview.discount_percent) {
        return `${app.displayName} is not currently reduced on Steam. Current price: ${priceOverview.final_formatted}.`;
    }

    return `${app.displayName} is currently reduced by ${priceOverview.discount_percent}% on Steam: ${priceOverview.initial_formatted} -> ${priceOverview.final_formatted}.`;
}

async function sendAppDiscount(send, app) {
    try {
        const priceOverview = await getAppDiscount(app);
        await send(formatAppDiscount(app, priceOverview));
    } catch (error) {
        console.error(error);
        await send(ERROR_MESSAGE);
    }
}

function getDelayUntilDailyCheck() {
    const now = new Date();
    const nextCheck = new Date(now);

    nextCheck.setUTCHours(DAILY_CHECK_HOUR_UTC, 0, 0, 0);

    if (nextCheck <= now) {
        nextCheck.setUTCDate(nextCheck.getUTCDate() + 1);
    }

    return nextCheck.getTime() - now.getTime();
}

function scheduleDailyAppDiscounts(channel) {
    setTimeout(async () => {
        for (const app of apps) {
            await sendAppDiscount((content) => channel.send(content), app);
        }

        scheduleDailyAppDiscounts(channel);
    }, getDelayUntilDailyCheck());
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    const channel = await readyClient.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
        throw new Error(`DISCORD_CHANNEL_ID ${channelId} is not a text channel.`);
    }

    scheduleDailyAppDiscounts(channel);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const command = message.content.trim().toLowerCase();
    const app = apps.find((steamApp) => steamApp.command === command);

    if (app) {
        console.log(
            `Command used: ${app.command} by ${message.author.tag} in #${message.channel.name}`,
        );
        await sendAppDiscount((content) => message.reply(content), app);
    }
});

client.login(token);

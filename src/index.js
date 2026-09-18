require("dotenv").config();
const { Client, Events, GatewayIntentBits } = require("discord.js");
const appConfig = require("../apps.json");

const DAILY_CHECK_HOUR_UTC = 6;
const ERROR_MESSAGE = "Error checking the Steam page. Please try again later.";
const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token) {
    throw new Error("DISCORD_TOKEN is required. Add it to a local .env file.");
}

if (!channelId) {
    throw new Error(
        "DISCORD_CHANNEL_ID is required. Add it to a local .env file.",
    );
}

const apps = Object.entries(appConfig).map(([key, id]) => ({
    id,
    name: key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
    command: `/${key.toLowerCase()}`,
}));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

async function getAppDiscount(appId) {
    const response = await fetch(
        `https://store.steampowered.com/api/appdetails?${new URLSearchParams({ appids: String(appId), filters: "price_overview" })}`,
    );

    if (!response.ok) {
        throw new Error(`Steam API responded with ${response.status}`);
    }

    return (
        (await response.json().appDetails[String(appId)].details.data
            ?.price_overview) ?? null
    );
}

function formatAppDiscount(name, priceOverview) {
    if (!priceOverview) {
        return `I couldn't find current Steam pricing for ${name}.`;
    }

    if (!priceOverview.discount_percent) {
        return `${name} is not currently reduced on Steam. Current price: ${priceOverview.final_formatted}.`;
    }

    return `${name} is currently reduced by ${priceOverview.discount_percent}% on Steam: ${priceOverview.initial_formatted} -> ${priceOverview.final_formatted}.`;
}

async function sendAppDiscount(send, name, appId) {
    try {
        await send(formatAppDiscount(name, await getAppDiscount(appId)));
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
            await sendAppDiscount(
                (content) => channel.send(content),
                app.name,
                app.id,
            );
        }

        scheduleDailyAppDiscounts(channel);
    }, getDelayUntilDailyCheck());
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    const channel = await readyClient.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
        throw new Error(
            `DISCORD_CHANNEL_ID ${channelId} is not a text channel.`,
        );
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
        await sendAppDiscount(
            (content) => message.reply(content),
            app.name,
            app.id,
        );
    }
});

client.login(token);

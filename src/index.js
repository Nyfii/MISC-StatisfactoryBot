import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import appConfig from "../apps.json" with { type: "json" };

const DAILY_CHECK_HOUR_UTC = 6;

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    throw new Error(
        "DISCORD_TOKEN or DISCORD_CHANNEL_ID are missing in the .env file.",
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

async function sendAppDiscount(send, name, appId) {
    const priceOverview = await fetch(
        `https://store.steampowered.com/api/appdetails?${new URLSearchParams({ appids: appId, filters: "price_overview" })}`,
    )
        .then((response) => response.json())
        .then((data) => data[appId]?.data?.price_overview ?? null);

    let content;
    if (priceOverview.discount_percent === 0) {
        content = `${name} is not currently reduced on Steam. Current price: ${priceOverview.final_formatted}.`;
    } else {
        content = `${name} is currently reduced by ${priceOverview.discount_percent}% on Steam: ${priceOverview.initial_formatted} -> ${priceOverview.final_formatted}.`;
    }

    await send(content);
}

function scheduleDailyAppDiscounts(channel) {
    const nextCheck = new Date();
    nextCheck.setUTCHours(DAILY_CHECK_HOUR_UTC, 0, 0, 0);
    if (nextCheck <= new Date()) nextCheck.setUTCDate(nextCheck.getUTCDate() + 1);

    setTimeout(async () => {
        for (const app of apps) {
            await sendAppDiscount(
                (content) => channel.send(content),
                app.name,
                app.id,
            );
        }

        scheduleDailyAppDiscounts(channel);
    }, nextCheck.getTime() - Date.now());
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    scheduleDailyAppDiscounts(
        await readyClient.channels.fetch(process.env.DISCORD_CHANNEL_ID),
    );
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const app = apps.find(
        (steamApp) => steamApp.command === message.content.trim().toLowerCase(),
    );
    if (!app) return;

    console.log(
        `Command used: ${app.command} by ${message.author.tag} in #${message.channel.name}`,
    );
    await sendAppDiscount(
        (content) => message.reply(content),
        app.name,
        app.id,
    );
});

client.login(process.env.DISCORD_TOKEN);

// ============================================================
//  EXTRACTED FUNCTIONS — AI + ORDER STATUS
//  Original file: index_(28)_1779048884980.js
// ============================================================

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const https = require('https');

// ─── CONFIG CONSTANTS (needed by these functions) ────────────
const TOKEN            = 'MTUwNTU0MjE2OTk3MTM5MjY5Mw.GDrtAV.61o_aL860p-ZIHkyCp89MCeVCcRnObrMd7rkHE';
const CLIENT_ID        = '1490472923545469040';
const OWNER_ID         = '1401115138915831872';
const ORDER_CHANNEL_ID = '1484941433411731616';
const ORDER_FORM_CHANNEL_ID = '1503511199747280968';
const OPENAI_API_KEY   = ''; // Set your OpenAI API key here


// ============================================================
//  1.  AI FUNCTION
//      Responds when the bot is @mentioned or during an
//      active conversation session.
// ============================================================

// --- Low-level OpenAI request helper ---
function callOpenAI(messages) {
    if (!OPENAI_API_KEY) return Promise.resolve(null);
    return new Promise((resolve) => {
        const data = JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages,
            max_tokens: 300,
            temperature: 0.8
        });
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body).choices[0].message.content); }
                catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

// --- System prompt for the AI assistant ---
const AI_SYSTEM_PROMPT = `You are the assistant bot for a design studio Discord server. You help customers with logos, banners, TikTok promos, and any design services offered. You are friendly, professional and respond in English.

Your job:
1. Greet customers warmly when they mention you
2. Ask what they need (banner, logo, TikTok promo, etc.)
3. Ask follow-up questions: colors, effects, style preferences, any reference images
4. Once you have enough info, confirm the order details
5. You can also answer questions about order status - tell them to check the order status channel or describe their current order status if you know it
6. Keep responses concise and helpful
7. Always respond in English
8. If someone asks about pricing or services, explain you offer banners, logos, TikTok promos and other design services

When the customer has provided all details for an order, end your message with [ORDER_COMPLETE] on a new line followed by the details in this format:
TYPE: <type>
NAME: <name or description>
EFFECTS: <effects requested>
COLORS: <colors requested>
EXTRA: <any extra details>

Only use [ORDER_COMPLETE] when you have gathered enough information to place the order.`;

// --- Main AI conversation handler ---
async function handleAIConversation(message, presetService = null) {
    const userId = message.author.id;
    if (!db.aiConversations[userId]) {
        db.aiConversations[userId] = {
            messages: [],
            lastActivity: Date.now(),
            photos: [],
            service: presetService
        };
    }
    const conv = db.aiConversations[userId];
    conv.lastActivity = Date.now();

    // Collect any image attachments
    if (message.attachments.size > 0) {
        message.attachments.forEach(att => {
            if (att.contentType && att.contentType.startsWith('image')) {
                conv.photos.push(att.url);
            }
        });
    }

    const userMsg = message.content.replace(/<@!?\d+>/g, '').trim();

    // Check if the user is asking about their order status
    const statusKeywords = ['order', 'status', 'how long', 'when', 'ready', 'done', 'progress', 'update', 'pedido', 'estado'];
    const isStatusQuery = statusKeywords.some(k => userMsg.toLowerCase().includes(k));
    if (isStatusQuery && db.activeOrders[userId]) {
        const order = db.activeOrders[userId];
        await message.reply(
            `Hey! Your current order status is: **${order.status}**\n` +
            `Estimated delivery: **${order.date}**\n\n` +
            `You can also check the order status channel for live updates!`
        );
        return;
    } else if (isStatusQuery && !db.activeOrders[userId]) {
        await message.reply(
            `Hey! I don't see any active orders for you right now. ` +
            `If you'd like to place a new order, just let me know what you need! ` +
            `We offer banners, logos, TikTok promos and more.`
        );
        return;
    }

    // Add the user's message to the conversation history
    conv.messages.push({ role: 'user', content: userMsg || '(sent an image)' });

    // Try OpenAI first
    if (OPENAI_API_KEY) {
        const systemPrompt = presetService
            ? `${AI_SYSTEM_PROMPT}\n\nThe customer has already selected: ${presetService}. Start by greeting them and asking for details about their ${presetService} order.`
            : AI_SYSTEM_PROMPT;

        const aiMessages = [{ role: 'system', content: systemPrompt }, ...conv.messages];
        const response = await callOpenAI(aiMessages);

        if (response) {
            conv.messages.push({ role: 'assistant', content: response });

            if (response.includes('[ORDER_COMPLETE]')) {
                const parts = response.split('[ORDER_COMPLETE]');
                const replyText = parts[0].trim();
                const orderDetails = parts[1]?.trim() || '';
                await message.reply(replyText || 'Great! Your order has been submitted!');
                await sendOrderEmbed(message, userId, orderDetails, conv.photos);
                delete db.aiConversations[userId];
                saveDB();
                return;
            }

            await message.reply(response);
            saveDB();
            return;
        }
    }

    // Fallback: rule-based conversation (used when OpenAI key is not set)
    const step = conv.messages.filter(m => m.role === 'user').length;
    let reply = '';

    if (step === 1) {
        if (presetService) {
            reply = `Hi there! 👋 Great choice! You selected **${presetService}**. What name or text should appear on it?`;
            conv.orderType = presetService;
        } else {
            reply = `Hi there! 👋 Welcome! I'm here to help you with your order. What do you need? We offer:\n\n• **Banners**\n• **Logos**\n• **TikTok Promos**\n• **Premium Service**\n\nJust tell me what you're looking for!`;
        }
    } else if (step === 2) {
        if (!conv.orderType) conv.orderType = userMsg;
        reply = `Awesome! So you're looking for a **${conv.orderType}**. What name or text should be on it?`;
    } else if (step === 3) {
        conv.orderName = userMsg;
        reply = `Got it! What **effects** would you like? (e.g., glowing, neon, 3D, minimalist, gradient, etc.)`;
    } else if (step === 4) {
        conv.orderEffects = userMsg;
        reply = `Nice choice! What **colors** do you want? (e.g., red and black, blue gradient, pastel colors, etc.)`;
    } else if (step === 5) {
        conv.orderColors = userMsg;
        reply = `Almost done! Any **extra details**? (background preferences, reference images, special requests) Type "none" if you're all set.`;
    } else if (step >= 6) {
        conv.orderExtra = userMsg === 'none' ? 'None specified' : userMsg;
        reply = `Perfect! Your order has been submitted! Our team will get on it soon. 🎨`;
        const orderDetails =
            `TYPE: ${conv.orderType || 'Not specified'}\n` +
            `NAME: ${conv.orderName || 'Not specified'}\n` +
            `EFFECTS: ${conv.orderEffects || 'Not specified'}\n` +
            `COLORS: ${conv.orderColors || 'Not specified'}\n` +
            `EXTRA: ${conv.orderExtra || 'None'}`;
        await message.reply(reply);
        await sendOrderEmbed(message, userId, orderDetails, conv.photos);
        delete db.aiConversations[userId];
        saveDB();
        return;
    }

    conv.messages.push({ role: 'assistant', content: reply });
    await message.reply(reply);
    saveDB();
}

// --- Sends the completed order embed to the order form channel ---
async function sendOrderEmbed(message, userId, orderDetails, photos) {
    const lines = orderDetails.split('\n');
    const getField = (prefix) => {
        const line = lines.find(l => l.startsWith(prefix));
        return line ? line.replace(prefix, '').trim() : 'Not specified';
    };

    const emb = new EmbedBuilder()
        .setAuthor({ name: `AI Order from ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
        .setColor(0x00FFFF)
        .addFields(
            { name: 'Type',             value: getField('TYPE:'),    inline: true  },
            { name: 'Name/Description', value: getField('NAME:'),    inline: true  },
            { name: 'Effects',          value: getField('EFFECTS:'), inline: true  },
            { name: 'Colors',           value: getField('COLORS:'),  inline: false },
            { name: 'Extra Details',    value: getField('EXTRA:'),   inline: false }
        )
        .setTimestamp();

    if (photos && photos.length > 0) {
        emb.setImage(photos[0]);
        if (photos.length > 1) {
            emb.addFields({
                name: 'Reference Images',
                value: photos.map((p, i) => `[Image ${i + 1}](${p})`).join(' | '),
                inline: false
            });
        }
    }

    const orderChan = client.channels.cache.get(ORDER_FORM_CHANNEL_ID);
    if (orderChan) {
        await orderChan.send({ content: `🤖 AI-assisted order from <@${userId}>`, embeds: [emb] });
    }
}

// --- messageCreate event: triggers the AI when the bot is @mentioned ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // If the user already has an active AI session, keep the conversation going
    if (db.aiConversations && db.aiConversations[message.author.id]) {
        const conv = db.aiConversations[message.author.id];
        if (Date.now() - conv.lastActivity < 600000) { // 10-minute inactivity window
            const botMentionCheck =
                message.content.includes(`<@${CLIENT_ID}>`) ||
                message.content.includes(`<@!${CLIENT_ID}>`);
            if (!botMentionCheck) {
                await handleAIConversation(message, conv.service || null);
                return;
            }
        } else {
            // Session expired
            delete db.aiConversations[message.author.id];
            saveDB();
        }
    }

    // Respond only when explicitly @mentioned (not via a reply)
    const botMentionInContent =
        message.content.includes(`<@${CLIENT_ID}>`) ||
        message.content.includes(`<@!${CLIENT_ID}>`);

    if (botMentionInContent && !message.reference) {
        try {
            const menuEmb = new EmbedBuilder()
                .setTitle('👋 Welcome to Tek Services!')
                .setColor(0x00FFFF)
                .setDescription(
                    `Hi <@${message.author.id}>! What service are you looking for?\n\n` +
                    `Select one of the options below and I'll guide you through the order process.`
                )
                .addFields(
                    { name: '🎨 Logo Design',   value: 'Custom logos for your server or brand',      inline: true },
                    { name: '🖼️ Banners',        value: 'Eye-catching banners for any platform',       inline: true },
                    { name: '📱 TikTok Promos',  value: 'Animated promos for TikTok & social media',  inline: true },
                    { name: '⭐ Premium Service', value: '🔒 **Exclusive channels & unique perks:**\n• Access to private VIP channels\n• Exclusive giveaways & events\n• Discounts on all services\n• Visible premium role in the server\n• Priority support 24/7', inline: true }
                )
                .setFooter({ text: 'Select a service to get started' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ai_service_logo_${message.author.id}`).setLabel('🎨 Logo').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`ai_service_banner_${message.author.id}`).setLabel('🖼️ Banner').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`ai_service_promo_${message.author.id}`).setLabel('📱 TikTok Promo').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`ai_service_premium_${message.author.id}`).setLabel('⭐ Premium Service').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`ai_service_other_${message.author.id}`).setLabel('❓ Other').setStyle(ButtonStyle.Secondary)
            );

            await message.reply({ embeds: [menuEmb], components: [row] });
        } catch (e) {
            console.error('AI service menu error:', e);
            await message.reply("Hi! 👋 I'm here to help! What do you need? We offer banners, logos, TikTok promos and more!").catch(() => {});
        }
    }
});


// ============================================================
//  2.  ORDER STATUS FUNCTION
// ============================================================

async function updateOrderEmbed() {
    const ordersList = Object.keys(db.activeOrders).length > 0
        ? Object.entries(db.activeOrders).map(([id, data]) =>
            `<:va_arrow:1484225522367205527> Order: <@${id}> -- Status: ${data.status}\n` +
            `<:utlarrowscratch1:1484937472449318962> Estimated delivery: ${data.date}`
          ).join('\n\n')
        : 'No active orders.';

    const emb = new EmbedBuilder()
        .setTitle('ORDER STATUS 📦')
        .setColor(0x00FFFF)
        .setDescription(`🟢 Done it.\n🟡 Working on it.\n🔴 Waiting.\n\n${ordersList}`);

    const orderChan = client.channels.cache.get(ORDER_CHANNEL_ID);
    let sent = false;

    if (db.lastOrderMessageId && orderChan) {
        try {
            const msg = await orderChan.messages.fetch(db.lastOrderMessageId);
            if (msg) { await msg.edit({ embeds: [emb] }); sent = true; }
        } catch (e) {}
    }

    if (!sent && orderChan) {
        const newMsg = await orderChan.send({ embeds: [emb] });
        db.lastOrderMessageId = newMsg.id;
        saveDB();
    }
}

// --- /order-status slash command handler (paste inside interactionCreate) ---
// if (commandName === 'order-status') {
//     if (userId !== OWNER_ID)
//         return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
//     const target = options.getUser('user');
//     const st     = options.getString('status');
//     const dt     = options.getString('date');
//     db.activeOrders[target.id] = { status: st, date: dt };
//     saveDB();
//     await updateOrderEmbed();
//     return interaction.reply({ content: '✅ Order status posted/updated.', ephemeral: true });
// }

// --- /order-clear slash command handler (paste inside interactionCreate) ---
// if (commandName === 'order-clear') {
//     if (userId !== OWNER_ID)
//         return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
//     const inputId = options.getString('id');
//     if (inputId.toLowerCase() === 'all') {
//         db.activeOrders = {};
//         if (db.lastOrderMessageId) {
//             try { await client.channels.cache.get(ORDER_CHANNEL_ID)?.messages.fetch(db.lastOrderMessageId).then(m => m.delete()); } catch(e){}
//             db.lastOrderMessageId = null;
//         }
//         saveDB();
//         return interaction.reply({ content: '✅ All orders cleared.', ephemeral: true });
//     } else {
//         if (db.activeOrders[inputId]) {
//             delete db.activeOrders[inputId]; saveDB();
//             await updateOrderEmbed();
//             return interaction.reply({ content: `✅ Order for user ${inputId} removed.`, ephemeral: true });
//         } else {
//             return interaction.reply({ content: '❌ User ID not found. Use "all" to clear everything.', ephemeral: true });
//         }
//     }
// }

// --- Owner shortcut inside messageCreate ---
// if (message.author.id === OWNER_ID) {
//     const content = message.content.toLowerCase();
//     const mentionedUser = message.mentions.users.first();
//     if (mentionedUser) {
//         let statusToSet = null; let isDelete = false;
//         if (content.includes('waiting')) statusToSet = '🔴';
//         else if (content.includes('working')) statusToSet = '🟡';
//         else if (content.includes('done'))    statusToSet = '🟢';
//         else if (content.includes('delete'))  isDelete = true;
//         if (statusToSet || isDelete) {
//             if (isDelete) {
//                 if (db.activeOrders[mentionedUser.id]) delete db.activeOrders[mentionedUser.id];
//             } else {
//                 const existingDate = db.activeOrders[mentionedUser.id]?.date || 'Pending';
//                 db.activeOrders[mentionedUser.id] = { status: statusToSet, date: existingDate };
//             }
//             saveDB();
//             await updateOrderEmbed();
//             message.react('✅').catch(() => {});
//         }
//     }
// }
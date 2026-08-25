/**
 * Bot de rendimiento ARK
 *
 * Instalación:
 * npm install discord.js
 *
 * Variables:
 * DISCORD_TOKEN
 * OPENAI_API_KEY        Opcional, para analizar capturas
 */

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;

// IDs configurados
const CLIENT_ID = process.env.CLIENT_ID || "1505542169971392693";
const GUILD_ID = process.env.GUILD_ID || "1541451682872037386";
const OWNER_ID = process.env.OWNER_ID || "1541467158901694505";

const DATA_FILE = path.join(__dirname, "ark-performance.json");

if (!TOKEN) {
  throw new Error("Falta configurar DISCORD_TOKEN en Secrets.");
}

// Base de datos
function createEmptyDatabase() {
  return {
    players: {},
  };
}

function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return createEmptyDatabase();
  }
}

function saveDatabase() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2));
}

let database = loadDatabase();

// Utilidades
function isOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
}

function getPlayer(discordId) {
  return database.players[discordId] || null;
}

function cleanValue(value, fallback = "—") {
  return String(value ?? fallback).slice(0, 1024);
}

function getTodayStats(player) {
  if (!player || !player.daily || !player.daily[todayKey()]) {
    return {
      hours: 0,
      turretsBroken: 0,
      dinosKilled: 0,
      playersKilled: 0,
      note: null,
      source: "manual",
      imageUrl: null,
    };
  }

  return player.daily[todayKey()];
}

// Calcula una nota automática si el owner no ha puesto nota manual
function calculatePerformanceScore(stats) {
  if (stats.note !== null && Number.isFinite(Number(stats.note))) {
    return Math.max(1, Math.min(10, Number(stats.note)));
  }

  const points =
    Math.min(stats.hours / 8, 1) * 3 +
    Math.min(stats.turretsBroken / 10, 1) * 3 +
    Math.min(stats.dinosKilled / 25, 1) * 2 +
    Math.min(stats.playersKilled / 5, 1) * 2;

  return Math.max(1, Math.min(10, Math.round(points * 10) / 10));
}

// Crea el embed visual de la performance
function createPerformanceEmbed(discordUser, player) {
  const stats = getTodayStats(player);
  const score = calculatePerformanceScore(stats);

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Performance de ${player.name}`)
    .setDescription(
      `📅 **${todayKey()}**\n\n` +
      `⭐ Nota general: **${score}/10**`
    )
    .addFields(
      {
        name: "🎮 PSN",
        value: cleanValue(player.psn),
        inline: true,
      },
      {
        name: "⏱️ Horas jugadas",
        value: `${stats.hours} horas`,
        inline: true,
      },
      {
        name: "🛡️ Torretas rotas",
        value: `${stats.turretsBroken}`,
        inline: true,
      },
      {
        name: "🦖 Dinos matados",
        value: `${stats.dinosKilled}`,
        inline: true,
      },
      {
        name: "⚔️ Jugadores matados",
        value: `${stats.playersKilled}`,
        inline: true,
      },
      {
        name: "📌 Datos",
        value:
          stats.source === "image"
            ? "Captura analizada automáticamente"
            : "Datos introducidos manualmente",
        inline: true,
      }
    )
    .setFooter({
      text: "ARK Tribe Performance",
    })
    .setTimestamp();

  if (player.photoUrl) {
    embed.setThumbnail(player.photoUrl);
  }

  if (stats.imageUrl) {
    embed.setImage(stats.imageUrl);
  }

  if (discordUser) {
    embed.setAuthor({
      name: discordUser.username,
      iconURL: discordUser.displayAvatarURL(),
    });
  }

  return embed;
}

// Máximo 25 jugadores por selector de Discord
function getPlayerChoices() {
  return Object.entries(database.players)
    .slice(0, 25)
    .map(([discordId, player]) => ({
      id: discordId,
      name: player.name,
    }));
}

// Comandos slash
const commands = [
  new SlashCommandBuilder()
    .setName("vincular")
    .setDescription("Vincula un miembro de Discord con su cuenta de PSN")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador de Discord")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("psn")
        .setDescription("ID o nombre de PlayStation Network")
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName("horas")
        .setDescription("Horas jugadas hoy")
        .setMinValue(0)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("horas")
    .setDescription("Actualiza las horas jugadas hoy")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName("cantidad")
        .setDescription("Horas jugadas hoy")
        .setMinValue(0)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("registrar-stats")
    .setDescription("Registra las estadísticas diarias")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("torretas")
        .setDescription("Torretas rotas")
        .setMinValue(0)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("dinos")
        .setDescription("Dinos matados")
        .setMinValue(0)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("jugadores")
        .setDescription("Jugadores matados")
        .setMinValue(0)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("nota")
        .setDescription("Nota general del 1 al 10")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("subir-foto")
    .setDescription("Guarda la foto de perfil de un jugador")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName("foto")
        .setDescription("Foto del jugador")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("subir-captura")
    .setDescription("Analiza una captura con estadísticas de ARK")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName("captura")
        .setDescription("Captura de las estadísticas")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("performance")
    .setDescription("Muestra la performance de un jugador")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tribu")
    .setDescription("Muestra un selector con todos los jugadores"),
].map(command => command.toJSON());

// Registra los comandos en tu servidor
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const route = Routes.applicationGuildCommands(
    CLIENT_ID,
    GUILD_ID
  );

  await rest.put(route, {
    body: commands,
  });

  console.log(`✅ ${commands.length} comandos registrados.`);
}

// Analiza una captura usando OpenAI
async function analyzeImage(imageUrl) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Analiza esta captura de ARK. Devuelve exclusivamente JSON válido " +
                    "con estas claves: hours, turretsBroken, dinosKilled, " +
                    "playersKilled y note. " +
                    "Si un dato no aparece, usa 0. " +
                    "Para note usa null si no aparece. " +
                    "No inventes ningún dato.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 200,
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    const result = JSON.parse(content);

    return {
      hours: Math.max(0, Number(result.hours) || 0),
      turretsBroken: Math.max(
        0,
        Number(result.turretsBroken) || 0
      ),
      dinosKilled: Math.max(
        0,
        Number(result.dinosKilled) || 0
      ),
      playersKilled: Math.max(
        0,
        Number(result.playersKilled) || 0
      ),
      note:
        result.note === null || result.note === undefined
          ? null
          : Math.max(1, Math.min(10, Number(result.note) || 1)),
      source: "image",
      imageUrl,
    };
  } catch (error) {
    console.error("Error analizando la imagen:", error.message);
    return null;
  }
}

// Cliente de Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

// Interacciones
client.on("interactionCreate", async interaction => {
  try {
    // Selector de jugadores
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "tribe-performance"
    ) {
      const playerId = interaction.values[0];
      const player = getPlayer(playerId);

      if (!player) {
        return interaction.reply({
          content: "Ese jugador ya no existe.",
          ephemeral: true,
        });
      }

      const discordUser = await client.users
        .fetch(playerId)
        .catch(() => null);

      return interaction.reply({
        embeds: [
          createPerformanceEmbed(discordUser, player),
        ],
        ephemeral: true,
      });
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const commandName = interaction.commandName;

    const adminCommands = [
      "vincular",
      "horas",
      "registrar-stats",
      "subir-foto",
      "subir-captura",
    ];

    if (
      adminCommands.includes(commandName) &&
      !isOwner(interaction)
    ) {
      return interaction.reply({
        content:
          "❌ Solo el owner puede modificar las performances.",
        ephemeral: true,
      });
    }

    // /vincular
    if (commandName === "vincular") {
      const user = interaction.options.getUser("jugador");
      const psn = interaction.options.getString("psn");
      const hours = interaction.options.getNumber("horas");

      const oldPlayer = getPlayer(user.id);

      database.players[user.id] = {
        ...(oldPlayer || {}),
        name: user.globalName || user.username,
        psn,
        photoUrl:
          oldPlayer?.photoUrl ||
          user.displayAvatarURL({
            extension: "png",
            size: 256,
          }),
        daily: oldPlayer?.daily || {},
      };

      if (hours !== null) {
        database.players[user.id].daily[todayKey()] = {
          ...getTodayStats(database.players[user.id]),
          hours,
        };
      }

      saveDatabase();

      return interaction.reply({
        content:
          `✅ ${user} ha sido vinculado con PSN **${psn}**.`,
        ephemeral: true,
      });
    }

    // /horas
    if (commandName === "horas") {
      const user = interaction.options.getUser("jugador");
      const amount = interaction.options.getNumber("cantidad");
      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content:
            "❌ Primero tienes que vincular al jugador con `/vincular`.",
          ephemeral: true,
        });
      }

      player.daily[todayKey()] = {
        ...getTodayStats(player),
        hours: amount,
      };

      saveDatabase();

      return interaction.reply({
        content:
          `✅ Horas de **${player.name}** actualizadas a **${amount}**.`,
        ephemeral: true,
      });
    }

    // /registrar-stats
    if (commandName === "registrar-stats") {
      const user = interaction.options.getUser("jugador");
      const turrets = interaction.options.getInteger("torretas");
      const dinos = interaction.options.getInteger("dinos");
      const players = interaction.options.getInteger("jugadores");
      const note = interaction.options.getInteger("nota");

      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content:
            "❌ Primero tienes que vincular al jugador con `/vincular`.",
          ephemeral: true,
        });
      }

      player.daily[todayKey()] = {
        ...getTodayStats(player),
        turretsBroken: turrets,
        dinosKilled: dinos,
        playersKilled: players,
        note,
        source: "manual",
      };

      saveDatabase();

      return interaction.reply({
        content:
          `✅ Estadísticas de **${player.name}** guardadas para hoy.`,
        ephemeral: true,
      });
    }

    // /subir-foto
    if (commandName === "subir-foto") {
      const user = interaction.options.getUser("jugador");
      const attachment = interaction.options.getAttachment("foto");

      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ El archivo tiene que ser una imagen.",
          ephemeral: true,
        });
      }

      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content:
            "❌ Primero tienes que vincular al jugador con `/vincular`.",
          ephemeral: true,
        });
      }

      player.photoUrl = attachment.url;
      saveDatabase();

      return interaction.reply({
        content:
          `✅ Foto de **${player.name}** guardada correctamente.`,
        ephemeral: true,
      });
    }

    // /subir-captura
    if (commandName === "subir-captura") {
      const user = interaction.options.getUser("jugador");
      const attachment =
        interaction.options.getAttachment("captura");

      if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ El archivo tiene que ser una imagen.",
          ephemeral: true,
        });
      }

      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content:
            "❌ Primero tienes que vincular al jugador con `/vincular`.",
          ephemeral: true,
        });
      }

      const stats = await analyzeImage(attachment.url);

      if (!stats) {
        return interaction.reply({
          content: process.env.OPENAI_API_KEY
            ? "❌ No pude leer la captura. Usa `/registrar-stats` para introducir los datos."
            : "ℹ️ No hay OPENAI_API_KEY configurada. Usa `/registrar-stats` para introducir los datos manualmente.",
          ephemeral: true,
        });
      }

      player.daily[todayKey()] = {
        ...getTodayStats(player),
        ...stats,
      };

      saveDatabase();

      return interaction.reply({
        content:
          `✅ Captura analizada y estadísticas de **${player.name}** guardadas.`,
        ephemeral: true,
      });
    }

    // /performance
    if (commandName === "performance") {
      const user = interaction.options.getUser("jugador");
      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content:
            "❌ Ese jugador todavía no está vinculado.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          createPerformanceEmbed(user, player),
        ],
      });
    }

    // /tribu
    if (commandName === "tribu") {
      const players = getPlayerChoices();

      if (!players.length) {
        return interaction.reply({
          content:
            "❌ Todavía no hay jugadores vinculados.",
          ephemeral: true,
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("tribe-performance")
        .setPlaceholder("Selecciona un miembro de la tribu")
        .addOptions(
          players.map(player =>
            new StringSelectMenuOptionBuilder()
              .setLabel(player.name.slice(0, 100))
              .setValue(player.id)
              .setDescription("Ver performance de hoy")
          )
        );

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📊 Performance de la tribu")
        .setDescription(
          "Selecciona un jugador para ver su foto y sus estadísticas de hoy."
        );

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
      });
    }
  } catch (error) {
    console.error("Error en interacción:", error);

    const response = {
      content: "❌ Ha ocurrido un error procesando el comando.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// Arranque
registerCommands()
  .then(() => client.login(TOKEN))
  .catch(error => {
    console.error("No se pudo iniciar el bot:", error);
    process.exitCode = 1;
  });
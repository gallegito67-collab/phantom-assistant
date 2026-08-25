const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ===============================
// CONFIGURACIÓN
// ===============================

const TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID = "1505542169971392693";
const GUILD_ID = "1541451682872037386";
const OWNER_ID = "1541467158901694505";

const DATABASE_FILE = path.join(__dirname, "ark-performance.json");

if (!TOKEN) {
  console.error("ERROR: Falta la variable DISCORD_TOKEN en Railway.");
  process.exit(1);
}

// ===============================
// BASE DE DATOS
// ===============================

function cargarBaseDeDatos() {
  try {
    if (!fs.existsSync(DATABASE_FILE)) {
      return { players: {} };
    }

    return JSON.parse(fs.readFileSync(DATABASE_FILE, "utf8"));
  } catch (error) {
    console.error("Error leyendo la base de datos:", error);
    return { players: {} };
  }
}

function guardarBaseDeDatos() {
  try {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(database, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Error guardando la base de datos:", error);
  }
}

const database = cargarBaseDeDatos();

// ===============================
// FUNCIONES AUXILIARES
// ===============================

function esOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

function fechaDeHoy() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid"
  }).format(new Date());
}

function obtenerJugador(discordId) {
  return database.players[discordId] || null;
}

function obtenerStatsDeHoy(jugador) {
  const fecha = fechaDeHoy();

  if (!jugador.daily) {
    jugador.daily = {};
  }

  if (!jugador.daily[fecha]) {
    jugador.daily[fecha] = {
      horas: 0,
      torretas: 0,
      dinos: 0,
      jugadores: 0,
      nota: null,
      origen: "manual",
      captura: null
    };
  }

  return jugador.daily[fecha];
}

function calcularNota(stats) {
  if (stats.nota !== null && stats.nota !== undefined) {
    return Math.max(1, Math.min(10, Number(stats.nota)));
  }

  const puntos =
    Math.min(stats.horas / 8, 1) * 3 +
    Math.min(stats.torretas / 10, 1) * 3 +
    Math.min(stats.dinos / 25, 1) * 2 +
    Math.min(stats.jugadores / 5, 1) * 2;

  return Math.max(
    1,
    Math.min(10, Math.round(puntos * 10) / 10)
  );
}

function crearEmbedPerformance(usuario, jugador) {
  const stats = obtenerStatsDeHoy(jugador);
  const nota = calcularNota(stats);

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Performance de ${jugador.nombre}`)
    .setDescription(
      `📅 Fecha: **${fechaDeHoy()}**\n\n` +
      `⭐ Nota general: **${nota}/10**`
    )
    .addFields(
      {
        name: "🎮 PSN",
        value: jugador.psn || "No indicado",
        inline: true
      },
      {
        name: "⏱️ Horas jugadas",
        value: `${stats.horas} horas`,
        inline: true
      },
      {
        name: "🛡️ Torretas rotas",
        value: `${stats.torretas}`,
        inline: true
      },
      {
        name: "🦖 Dinos matados",
        value: `${stats.dinos}`,
        inline: true
      },
      {
        name: "⚔️ Jugadores matados",
        value: `${stats.jugadores}`,
        inline: true
      },
      {
        name: "📌 Datos",
        value:
          stats.origen === "captura"
            ? "Leídos desde una captura"
            : "Introducidos manualmente",
        inline: true
      }
    )
    .setFooter({
      text: "ARK Tribe Performance"
    })
    .setTimestamp();

  if (jugador.foto) {
    embed.setThumbnail(jugador.foto);
  }

  if (stats.captura) {
    embed.setImage(stats.captura);
  }

  if (usuario) {
    embed.setAuthor({
      name: usuario.username,
      iconURL: usuario.displayAvatarURL()
    });
  }

  return embed;
}

// ===============================
// COMANDOS
// ===============================

const comandos = [
  new SlashCommandBuilder()
    .setName("vincular")
    .setDescription("Vincula un jugador de Discord con su PSN")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador de Discord")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("psn")
        .setDescription("Nombre o ID de PSN")
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
        .setDescription("Número de horas")
        .setMinValue(0)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("registrar-stats")
    .setDescription("Registra las estadísticas de hoy")
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
        .setDescription("Nota del 1 al 10")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("subir-foto")
    .setDescription("Sube la foto del jugador")
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
    .setDescription("Guarda una captura de estadísticas")
    .addUserOption(option =>
      option
        .setName("jugador")
        .setDescription("Jugador")
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName("captura")
        .setDescription("Captura del tribelog")
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
    .setDescription("Muestra el selector de jugadores")
].map(comando => comando.toJSON());

// ===============================
// REGISTRAR COMANDOS
// ===============================

async function registrarComandos() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: comandos
    }
  );

  console.log("✅ Comandos registrados correctamente.");
}

// ===============================
// CLIENTE DISCORD
// ===============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  try {
    // Selector /tribu
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "selector-performance"
    ) {
      const jugador = obtenerJugador(interaction.values[0]);

      if (!jugador) {
        return interaction.reply({
          content: "Ese jugador ya no existe.",
          ephemeral: true
        });
      }

      const usuario = await client.users
        .fetch(interaction.values[0])
        .catch(() => null);

      return interaction.reply({
        embeds: [
          crearEmbedPerformance(usuario, jugador)
        ],
        ephemeral: true
      });
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const comando = interaction.commandName;

    const comandosDeOwner = [
      "vincular",
      "horas",
      "registrar-stats",
      "subir-foto",
      "subir-captura"
    ];

    if (
      comandosDeOwner.includes(comando) &&
      !esOwner(interaction)
    ) {
      return interaction.reply({
        content:
          "❌ Solo el owner puede modificar los datos.",
        ephemeral: true
      });
    }

    // /vincular
    if (comando === "vincular") {
      const usuario = interaction.options.getUser("jugador");
      const psn = interaction.options.getString("psn");
      const horas = interaction.options.getNumber("horas");

      const anterior = obtenerJugador(usuario.id);

      database.players[usuario.id] = {
        nombre: usuario.globalName || usuario.username,
        psn,
        foto:
          anterior?.foto ||
          usuario.displayAvatarURL({
            extension: "png",
            size: 256
          }),
        daily: anterior?.daily || {}
      };

      if (horas !== null) {
        const stats = obtenerStatsDeHoy(
          database.players[usuario.id]
        );

        stats.horas = horas;
      }

      guardarBaseDeDatos();

      return interaction.reply({
        content:
          `✅ ${usuario} vinculado con PSN **${psn}**.`,
        ephemeral: true
      });
    }

    // /horas
    if (comando === "horas") {
      const usuario = interaction.options.getUser("jugador");
      const cantidad = interaction.options.getNumber("cantidad");
      const jugador = obtenerJugador(usuario.id);

      if (!jugador) {
        return interaction.reply({
          content:
            "❌ Primero usa `/vincular` con ese jugador.",
          ephemeral: true
        });
      }

      const stats = obtenerStatsDeHoy(jugador);
      stats.horas = cantidad;

      guardarBaseDeDatos();

      return interaction.reply({
        content:
          `✅ Horas de **${jugador.nombre}** actualizadas a **${cantidad}**.`,
        ephemeral: true
      });
    }

    // /registrar-stats
    if (comando === "registrar-stats") {
      const usuario = interaction.options.getUser("jugador");
      const torretas = interaction.options.getInteger("torretas");
      const dinos = interaction.options.getInteger("dinos");
      const jugadores = interaction.options.getInteger("jugadores");
      const nota = interaction.options.getInteger("nota");

      const jugador = obtenerJugador(usuario.id);

      if (!jugador) {
        return interaction.reply({
          content:
            "❌ Primero usa `/vincular` con ese jugador.",
          ephemeral: true
        });
      }

      const stats = obtenerStatsDeHoy(jugador);

      stats.torretas = torretas;
      stats.dinos = dinos;
      stats.jugadores = jugadores;
      stats.nota = nota;
      stats.origen = "manual";

      guardarBaseDeDatos();

      return interaction.reply({
        content:
          `✅ Estadísticas de **${jugador.nombre}** guardadas.`,
        ephemeral: true
      });
    }

    // /subir-foto
    if (comando === "subir-foto") {
      const usuario = interaction.options.getUser("jugador");
      const archivo = interaction.options.getAttachment("foto");

      if (!archivo.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ El archivo debe ser una imagen.",
          ephemeral: true
        });
      }

      const jugador = obtenerJugador(usuario.id);

      if (!jugador) {
        return interaction.reply({
          content:
            "❌ Primero usa `/vincular` con ese jugador.",
          ephemeral: true
        });
      }

      jugador.foto = archivo.url;
      guardarBaseDeDatos();

      return interaction.reply({
        content:
          `✅ Foto de **${jugador.nombre}** guardada.`,
        ephemeral: true
      });
    }

    // /subir-captura
    if (comando === "subir-captura") {
      const usuario = interaction.options.getUser("jugador");
      const archivo =
        interaction.options.getAttachment("captura");

      if (!archivo.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "❌ El archivo debe ser una imagen.",
          ephemeral: true
        });
      }

      const jugador = obtenerJugador(usuario.id);

      if (!jugador) {
        return interaction.reply({
          content:
            "❌ Primero usa `/vincular` con ese jugador.",
          ephemeral: true
        });
      }

      const stats = obtenerStatsDeHoy(jugador);
      stats.captura = archivo.url;
      stats.origen = "captura";

      guardarBaseDeDatos();

      return interaction.reply({
        content:
          `✅ Captura de **${jugador.nombre}** guardada.`,
        ephemeral: true
      });
    }

    // /performance
    if (comando === "performance") {
      const usuario = interaction.options.getUser("jugador");
      const jugador = obtenerJugador(usuario.id);

      if (!jugador) {
        return interaction.reply({
          content:
            "❌ Ese jugador todavía no está vinculado.",
          ephemeral: true
        });
      }

      return interaction.reply({
        embeds: [
          crearEmbedPerformance(usuario, jugador)
        ]
      });
    }

    // /tribu
    if (comando === "tribu") {
      const jugadores = Object.entries(database.players)
        .slice(0, 25)
        .map(([id, jugador]) => ({
          id,
          nombre: jugador.nombre
        }));

      if (jugadores.length === 0) {
        return interaction.reply({
          content:
            "❌ Todavía no hay jugadores vinculados.",
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("selector-performance")
        .setPlaceholder("Selecciona un jugador")
        .addOptions(
          jugadores.map(jugador =>
            new StringSelectMenuOptionBuilder()
              .setLabel(jugador.nombre.slice(0, 100))
              .setValue(jugador.id)
              .setDescription("Ver su performance de hoy")
          )
        );

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📊 Performance de la tribu")
        .setDescription(
          "Selecciona un miembro para ver su foto y sus estadísticas."
        );

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu)
        ]
      });
    }
  } catch (error) {
    console.error("Error procesando interacción:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Ha ocurrido un error.",
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Ha ocurrido un error.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ===============================
// ARRANQUE
// ===============================

registrarComandos()
  .then(() => client.login(TOKEN))
  .catch(error => {
    console.error("No se pudo arrancar el bot:", error);
    process.exit(1);
  });
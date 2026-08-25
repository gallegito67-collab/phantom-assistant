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

const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// CONFIGURACIÓN
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID =
  process.env.CLIENT_ID || "1505542169971392693";

const GUILD_ID =
  process.env.GUILD_ID || "1541451682872037386";

const OWNER_ID =
  process.env.OWNER_ID || "1541467158901694505";

// Si el rol se llama "owner", funcionará automáticamente
const OWNER_ROLE_ID =
  process.env.OWNER_ROLE_ID || "";

const OWNER_ROLE_NAME = (
  process.env.OWNER_ROLE_NAME || "owner"
).toLowerCase();

const DATABASE_FILE = path.join(
  __dirname,
  "ark-performance.json"
);

const PERFORMANCE_GIF =
  "https://cdn.discordapp.com/attachments/1541467260642664623/1541754421711470722/0824.gif?ex=6a8ebe32&is=6a8d6cb2&hm=f2c70feb1c047bda392c0623f157fc3c57a5970947de3b2a5bce3cbde8d35111&";

if (!TOKEN) {
  console.error(
    "ERROR: Falta la variable DISCORD_TOKEN en Railway."
  );

  process.exit(1);
}

// ==========================================
// BASE DE DATOS
// ==========================================

function cargarBaseDeDatos() {
  try {
    if (!fs.existsSync(DATABASE_FILE)) {
      return {
        players: {}
      };
    }

    const contenido = fs.readFileSync(
      DATABASE_FILE,
      "utf8"
    );

    return JSON.parse(contenido);
  } catch (error) {
    console.error(
      "Error cargando la base de datos:",
      error
    );

    return {
      players: {}
    };
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
    console.error(
      "Error guardando la base de datos:",
      error
    );
  }
}

const database = cargarBaseDeDatos();

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function esOwner(interaction) {
  // El owner por ID tiene permiso
  if (interaction.user.id === OWNER_ID) {
    return true;
  }

  // También tiene permiso el rol configurado
  const roles = interaction.member?.roles?.cache;

  if (!roles) {
    return false;
  }

  return roles.some(role => {
    const coincidePorId =
      OWNER_ROLE_ID &&
      role.id === OWNER_ROLE_ID;

    const coincidePorNombre =
      role.name.toLowerCase() === OWNER_ROLE_NAME;

    return coincidePorId || coincidePorNombre;
  });
}

function obtenerFechaDeHoy() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid"
  }).format(new Date());
}

function obtenerJugador(discordId) {
  return database.players[discordId] || null;
}

function obtenerStatsDeHoy(jugador) {
  const fecha = obtenerFechaDeHoy();

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
  if (
    stats.nota !== null &&
    stats.nota !== undefined &&
    !Number.isNaN(Number(stats.nota))
  ) {
    return Math.max(
      1,
      Math.min(10, Number(stats.nota))
    );
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

function crearBarraDePerformance(nota) {
  const bloquesLlenos = Math.max(
    0,
    Math.min(10, Math.round(nota))
  );

  const bloquesVacios = 10 - bloquesLlenos;

  return (
    "█".repeat(bloquesLlenos) +
    "░".repeat(bloquesVacios)
  );
}

function crearPerformanceEmbed(usuario, jugador) {
  const stats = obtenerStatsDeHoy(jugador);
  const nota = calcularNota(stats);
  const barra = crearBarraDePerformance(nota);

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Performance de ${jugador.nombre}`)
    .setDescription(
      `Fecha: **${obtenerFechaDeHoy()}**\n\n` +
      `**Valoración: ${nota}/10**\n` +
      `\`${barra}\``
    )
    .addFields(
      {
        name: "PSN",
        value: jugador.psn || "No indicado",
        inline: false
      },
      {
        name: "Horas jugadas hoy",
        value: `${stats.horas} horas`,
        inline: false
      },
      {
        name: "Torretas rotas",
        value: `${stats.torretas}`,
        inline: false
      },
      {
        name: "Dinos matados",
        value: `${stats.dinos}`,
        inline: false
      },
      {
        name: "Jugadores matados",
        value: `${stats.jugadores}`,
        inline: false
      },
      {
        name: "Origen de los datos",
        value:
          stats.origen === "captura"
            ? "Captura subida"
            : "Introducidos manualmente",
        inline: false
      }
    )
    .setFooter({
      text: "ARK Tribe Performance",
      iconURL: PERFORMANCE_GIF
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

// ==========================================
// COMANDOS
// ==========================================

const comandos = [
  new SlashCommandBuilder()
    .setName("vincular")
    .setDescription("Vincula un jugador con su PSN")
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
        .setDescription("Cantidad de horas")
        .setMinValue(0)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("registrar-stats")
    .setDescription("Registra las estadísticas del día")
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
    .setDescription("Sube la foto de un jugador")
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
    .setDescription("Muestra todos los jugadores")
].map(comando => comando.toJSON());

// ==========================================
// REGISTRO DE COMANDOS
// ==========================================

async function registrarComandos() {
  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: comandos
    }
  );

  console.log(
    `✅ ${comandos.length} comandos registrados.`
  );
}

// ==========================================
// CLIENTE DE DISCORD
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once("ready", () => {
  console.log(
    `✅ Bot conectado como ${client.user.tag}`
  );
});

// ==========================================
// INTERACCIONES
// ==========================================

client.on(
  "interactionCreate",
  async interaction => {
    try {
      // Selector del comando /tribu
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "selector-performance"
      ) {
        const discordId = interaction.values[0];
        const jugador = obtenerJugador(discordId);

        if (!jugador) {
          return interaction.reply({
            content: "Ese jugador no existe.",
            ephemeral: true
          });
        }

        const usuario = await client.users
          .fetch(discordId)
          .catch(() => null);

        return interaction.reply({
          embeds: [
            crearPerformanceEmbed(
              usuario,
              jugador
            )
          ],
          ephemeral: true
        });
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      const comando = interaction.commandName;

      // Estos comandos solo los usa el owner o el rol owner
      const comandosProtegidos = [
        "vincular",
        "horas",
        "registrar-stats",
        "subir-foto",
        "subir-captura"
      ];

      if (
        comandosProtegidos.includes(comando) &&
        !esOwner(interaction)
      ) {
        return interaction.reply({
          content:
            "Solo el owner o el rol owner puede modificar los datos.",
          ephemeral: true
        });
      }

      // ========================================
      // /vincular
      // ========================================

      if (comando === "vincular") {
        const usuario =
          interaction.options.getUser("jugador");

        const psn =
          interaction.options.getString("psn");

        const horas =
          interaction.options.getNumber("horas");

        const jugadorAnterior =
          obtenerJugador(usuario.id);

        database.players[usuario.id] = {
          nombre:
            usuario.globalName ||
            usuario.username,

          psn,

          foto:
            jugadorAnterior?.foto ||
            usuario.displayAvatarURL({
              extension: "png",
              size: 256
            }),

          daily:
            jugadorAnterior?.daily || {}
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
            `${usuario} ha sido vinculado con PSN **${psn}**.`,
          ephemeral: true
        });
      }

      // ========================================
      // /horas
      // ========================================

      if (comando === "horas") {
        const usuario =
          interaction.options.getUser("jugador");

        const cantidad =
          interaction.options.getNumber("cantidad");

        const jugador =
          obtenerJugador(usuario.id);

        if (!jugador) {
          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral: true
          });
        }

        const stats =
          obtenerStatsDeHoy(jugador);

        stats.horas = cantidad;

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Horas de **${jugador.nombre}** actualizadas a **${cantidad}**.`,
          ephemeral: true
        });
      }

      // ========================================
      // /registrar-stats
      // ========================================

      if (comando === "registrar-stats") {
        const usuario =
          interaction.options.getUser("jugador");

        const torretas =
          interaction.options.getInteger("torretas");

        const dinos =
          interaction.options.getInteger("dinos");

        const jugadores =
          interaction.options.getInteger("jugadores");

        const nota =
          interaction.options.getInteger("nota");

        const jugador =
          obtenerJugador(usuario.id);

        if (!jugador) {
          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral: true
          });
        }

        const stats =
          obtenerStatsDeHoy(jugador);

        stats.torretas = torretas;
        stats.dinos = dinos;
        stats.jugadores = jugadores;
        stats.nota = nota;
        stats.origen = "manual";

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Estadísticas de **${jugador.nombre}** guardadas.`,
          ephemeral: true
        });
      }

      // ========================================
      // /subir-foto
      // ========================================

      if (comando === "subir-foto") {
        const usuario =
          interaction.options.getUser("jugador");

        const archivo =
          interaction.options.getAttachment("foto");

        if (
          !archivo.contentType ||
          !archivo.contentType.startsWith("image/")
        ) {
          return interaction.reply({
            content:
              "El archivo debe ser una imagen.",
            ephemeral: true
          });
        }

        const jugador =
          obtenerJugador(usuario.id);

        if (!jugador) {
          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral: true
          });
        }

        jugador.foto = archivo.url;

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Foto de **${jugador.nombre}** guardada.`,
          ephemeral: true
        });
      }

      // ========================================
      // /subir-captura
      // ========================================

      if (comando === "subir-captura") {
        const usuario =
          interaction.options.getUser("jugador");

        const archivo =
          interaction.options.getAttachment("captura");

        if (
          !archivo.contentType ||
          !archivo.contentType.startsWith("image/")
        ) {
          return interaction.reply({
            content:
              "El archivo debe ser una imagen.",
            ephemeral: true
          });
        }

        const jugador =
          obtenerJugador(usuario.id);

        if (!jugador) {
          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral: true
          });
        }

        const stats =
          obtenerStatsDeHoy(jugador);

        stats.captura = archivo.url;
        stats.origen = "captura";

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Captura de **${jugador.nombre}** guardada.`,
          ephemeral: true
        });
      }

      // ========================================
      // /performance
      // ========================================

      if (comando === "performance") {
        const usuario =
          interaction.options.getUser("jugador");

        const jugador =
          obtenerJugador(usuario.id);

        if (!jugador) {
          return interaction.reply({
            content:
              "Ese jugador todavía no está vinculado.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            crearPerformanceEmbed(
              usuario,
              jugador
            )
          ]
        });
      }

      // ========================================
      // /tribu
      // ========================================

      if (comando === "tribu") {
        const jugadores =
          Object.entries(database.players)
            .slice(0, 25)
            .map(([id, jugador]) => ({
              id,
              nombre: jugador.nombre
            }));

        if (jugadores.length === 0) {
          return interaction.reply({
            content:
              "Todavía no hay jugadores vinculados.",
            ephemeral: true
          });
        }

        const menu =
          new StringSelectMenuBuilder()
            .setCustomId("selector-performance")
            .setPlaceholder(
              "Selecciona un jugador"
            )
            .addOptions(
              jugadores.map(jugador =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(
                    jugador.nombre.slice(0, 100)
                  )
                  .setValue(jugador.id)
                  .setDescription(
                    "Ver performance de hoy"
                  )
              )
            );

        const embed =
          new EmbedBuilder()
            .setColor(0x8b5cf6)
            .setTitle(
              "Performance de la tribu"
            )
            .setDescription(
              "Selecciona un miembro para ver todas sus estadísticas de hoy."
            )
            .setFooter({
              text: "ARK Tribe Performance",
              iconURL: PERFORMANCE_GIF
            });

        return interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(menu)
          ]
        });
      }
    } catch (error) {
      console.error(
        "Error procesando interacción:",
        error
      );

      const respuesta = {
        content:
          "Ha ocurrido un error procesando el comando.",
        ephemeral: true
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction.followUp(respuesta)
          .catch(() => {});
      } else {
        await interaction.reply(respuesta)
          .catch(() => {});
      }
    }
  }
);

// ==========================================
// ARRANQUE
// ==========================================

registrarComandos()
  .then(() => {
    return client.login(TOKEN);
  })
  .then(() => {
    console.log("Inicio completado.");
  })
  .catch(error => {
    console.error(
      "No se pudo iniciar el bot:",
      error
    );

    process.exit(1);
  });
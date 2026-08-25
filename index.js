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

let psnApi = null;

try {
  psnApi = require("psn-api");
} catch (error) {
  console.warn(
    "⚠️ psn-api no está instalado. Ejecuta: npm install psn-api"
  );
}

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

const PSN_NPSSO =
  process.env.PSN_NPSSO || "";

const ONLINE_UPDATE_INTERVAL =
  60 * 1000;

let psnAuthorization = null;
let actualizandoPresencias = false;

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
        players: {},
        onlineTribe: null
      };
    }

    const contenido =
      fs.readFileSync(
        DATABASE_FILE,
        "utf8"
      );

    const datos =
      JSON.parse(contenido);

    if (!datos.players) {
      datos.players = {};
    }

    if (!datos.onlineTribe) {
      datos.onlineTribe = null;
    }

    return datos;

  } catch (error) {
    console.error(
      "Error cargando la base de datos:",
      error
    );

    return {
      players: {},
      onlineTribe: null
    };
  }
}

function guardarBaseDeDatos() {
  try {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(
        database,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Error guardando la base de datos:",
      error
    );
  }
}

const database =
  cargarBaseDeDatos();

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function esOwner(interaction) {
  if (
    interaction.user.id === OWNER_ID
  ) {
    return true;
  }

  const roles =
    interaction.member?.roles?.cache;

  if (!roles) {
    return false;
  }

  return roles.some(role => {
    const coincidePorId =
      OWNER_ROLE_ID &&
      role.id === OWNER_ROLE_ID;

    const coincidePorNombre =
      role.name.toLowerCase() ===
      OWNER_ROLE_NAME;

    return (
      coincidePorId ||
      coincidePorNombre
    );
  });
}

function obtenerFechaDeHoy() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Europe/Madrid"
    }
  ).format(new Date());
}

function obtenerJugador(discordId) {
  return (
    database.players[discordId] ||
    null
  );
}

function obtenerStatsDeHoy(jugador) {
  const fecha =
    obtenerFechaDeHoy();

  if (!jugador.daily) {
    jugador.daily = {};
  }

  if (!jugador.daily[fecha]) {
    jugador.daily[fecha] = {
      horas: 0,
      minutosOnline: 0,
      torretas: 0,
      dinos: 0,
      jugadores: 0,
      nota: null,
      origen: "manual",
      captura: null
    };
  }

  if (
    jugador.daily[fecha]
      .minutosOnline === undefined
  ) {
    jugador.daily[fecha]
      .minutosOnline = 0;
  }

  return jugador.daily[fecha];
}

function calcularNota(stats) {
  if (
    stats.nota !== null &&
    stats.nota !== undefined &&
    !Number.isNaN(
      Number(stats.nota)
    )
  ) {
    return Math.max(
      1,
      Math.min(
        10,
        Number(stats.nota)
      )
    );
  }

  const puntos =
    Math.min(
      stats.horas / 8,
      1
    ) * 3 +

    Math.min(
      stats.torretas / 10,
      1
    ) * 3 +

    Math.min(
      stats.dinos / 25,
      1
    ) * 2 +

    Math.min(
      stats.jugadores / 5,
      1
    ) * 2;

  return Math.max(
    1,
    Math.min(
      10,
      Math.round(
        puntos * 10
      ) / 10
    )
  );
}

function crearBarraDePerformance(
  nota
) {
  const bloquesLlenos =
    Math.max(
      0,
      Math.min(
        10,
        Math.round(nota)
      )
    );

  const bloquesVacios =
    10 - bloquesLlenos;

  return (
    "█".repeat(
      bloquesLlenos
    ) +
    "░".repeat(
      bloquesVacios
    )
  );
}

function formatearHorasOnline(
  minutosTotales
) {
  const minutosSeguros =
    Math.max(
      0,
      Number(
        minutosTotales || 0
      )
    );

  const horas =
    Math.floor(
      minutosSeguros / 60
    );

  const minutosRestantes =
    Math.floor(
      minutosSeguros % 60
    );

  return (
    `${horas}h ` +
    `${String(
      minutosRestantes
    ).padStart(2, "0")}m`
  );
}

function obtenerColorEmbed(
  color
) {
  const colorLimpio =
    String(
      color ||
      ""
    )
      .trim()
      .replace(
        /^#/,
        ""
      );

  if (
    !/^[0-9a-fA-F]{6}$/.test(
      colorLimpio
    )
  ) {
    return null;
  }

  return Number.parseInt(
    colorLimpio,
    16
  );
}

function esImagenAdjunta(
  archivo
) {
  return Boolean(
    archivo?.url &&
    archivo?.contentType?.startsWith(
      "image/"
    )
  );
}

// ==========================================
// PSN
// ==========================================

function obtenerPresenciaNormalizada(
  presencia
) {
  const onlineStatus =
    presencia?.onlineStatus ||
    presencia
      ?.primaryPlatformInfo
      ?.onlineStatus ||
    "offline";

  const online =
    String(
      onlineStatus
    ).toLowerCase() ===
    "online";

  const plataforma =
    presencia?.platform ||
    presencia
      ?.primaryPlatformInfo
      ?.platform ||
    null;

  const juegos =
    Array.isArray(
      presencia
        ?.gameTitleInfoList
    )
      ? presencia.gameTitleInfoList
      : [];

  const juego =
    juegos[0]?.titleName ||
    null;

  return {
    online,
    plataforma,
    juego
  };
}

async function obtenerAutorizacionPSN() {
  if (
    psnAuthorization?.accessToken
  ) {
    return psnAuthorization;
  }

  if (!psnApi) {
    return null;
  }

  if (!PSN_NPSSO) {
    console.warn(
      "⚠️ Falta PSN_NPSSO."
    );

    return null;
  }

  try {
    const accessCode =
      await psnApi
        .exchangeNpssoForAccessCode(
          PSN_NPSSO
        );

    psnAuthorization =
      await psnApi
        .exchangeAccessCodeForAuthTokens(
          accessCode
        );

    console.log(
      "✅ Autenticación PSN completada."
    );

    return psnAuthorization;

  } catch (error) {
    psnAuthorization =
      null;

    console.error(
      "❌ Error autenticando PSN:",
      error?.message ||
      error
    );

    return null;
  }
}

async function obtenerAccountIdPSN(
  psn
) {
  const authorization =
    await obtenerAutorizacionPSN();

  if (
    !authorization ||
    !psnApi ||
    !psn
  ) {
    return null;
  }

  try {
    const resultado =
      await psnApi
        .makeUniversalSearch(
          authorization,
          psn,
          "SocialAllAccounts"
        );

    const dominio =
      resultado
        ?.domainResponses
        ?.find(
          item =>
            item?.domain ===
            "SocialAllAccounts"
        ) ||
      resultado
        ?.domainResponses?.[0];

    const encontrado =
      dominio?.results?.[0];

    return (
      encontrado
        ?.socialMetadata
        ?.accountId ||

      encontrado
        ?.accountId ||

      null
    );

  } catch (error) {
    console.error(
      `No se pudo encontrar PSN "${psn}":`,
      error?.message ||
      error
    );

    return null;
  }
}

async function obtenerPresenciaPSN(
  accountId
) {
  const authorization =
    await obtenerAutorizacionPSN();

  if (
    !authorization ||
    !psnApi ||
    !accountId
  ) {
    return {
      online: false,
      plataforma: null,
      juego: null,
      error: true
    };
  }

  try {
    const presencia =
      await psnApi
        .getBasicPresence(
          authorization,
          accountId
        );

    return {
      ...obtenerPresenciaNormalizada(
        presencia
      ),
      error: false
    };

  } catch (error) {
    console.error(
      `Error consultando PSN ${accountId}:`,
      error?.message ||
      error
    );

    const mensaje =
      String(
        error?.message || ""
      ).toLowerCase();

    if (
      mensaje.includes("401") ||
      mensaje.includes(
        "unauthorized"
      )
    ) {
      psnAuthorization =
        null;
    }

    return {
      online: false,
      plataforma: null,
      juego: null,
      error: true
    };
  }
}// ==========================================
// ONLINE TRIBE
// ==========================================

function crearOnlineTribeEmbed() {
  const jugadores =
    Object.entries(
      database.players
    );

  const embed =
    new EmbedBuilder()
      .setColor(0xffffff)
      .setTitle(
        "🎮 ONLINE TRIBE"
      )
      .setDescription(
        jugadores.length === 0
          ? "Todavía no hay jugadores vinculados."
          : "Estado actual de los jugadores vinculados a PSN."
      )
      .setFooter({
        text:
          "Actualización automática cada 1 minuto"
      })
      .setTimestamp();

  if (
    jugadores.length === 0
  ) {
    return embed;
  }

  const lineas =
    jugadores.map(
      ([, jugador]) => {
        const icono =
          jugador.online === true
            ? "🟢"
            : "🔴";

        const estado =
          jugador.online === true
            ? "Online"
            : "Offline";

        return (
          `${icono} **${jugador.nombre}** — ${estado}`
        );
      }
    );

  embed.setDescription(
    `**Miembros vinculados:** ${jugadores.length}\n\n` +
    lineas.join("\n")
  );

  return embed;
}

async function actualizarMensajeOnlineTribe() {
  const configuracion =
    database.onlineTribe;

  if (
    !configuracion?.channelId ||
    !configuracion?.messageId
  ) {
    return;
  }

  try {
    const canal =
      await client.channels.fetch(
        configuracion.channelId
      );

    if (
      !canal ||
      !canal.isTextBased()
    ) {
      return;
    }

    const mensaje =
      await canal.messages.fetch(
        configuracion.messageId
      );

    await mensaje.edit({
      embeds: [
        crearOnlineTribeEmbed()
      ]
    });

  } catch (error) {
    console.error(
      "No se pudo actualizar ONLINE TRIBE:",
      error?.message ||
      error
    );
  }
}

// ==========================================
// MONITOR PSN
// ==========================================

async function actualizarPresencias() {
  if (
    actualizandoPresencias
  ) {
    return;
  }

  actualizandoPresencias =
    true;

  try {
    const jugadores =
      Object.entries(
        database.players
      );

    if (
      jugadores.length === 0
    ) {
      await actualizarMensajeOnlineTribe();
      return;
    }

    let huboCambios =
      false;

    const ahora =
      Date.now();

    for (
      const [
        discordId,
        jugador
      ] of jugadores
    ) {

      if (
        !jugador.psnAccountId
      ) {
        continue;
      }

      const presencia =
        await obtenerPresenciaPSN(
          jugador.psnAccountId
        );

      /*
       * Si PSN da error temporal,
       * NO marcamos al jugador offline.
       */
      if (
        presencia.error
      ) {
        continue;
      }

      const estaOnline =
        presencia.online === true;

      const estabaOnline =
        jugador.online === true;

      // ========================================
      // PRIMER CHEQUEO
      // ========================================

      if (
        jugador.online ===
        undefined
      ) {

        jugador.online =
          estaOnline;

        jugador.onlineSince =
          estaOnline
            ? new Date(
                ahora
              ).toISOString()
            : null;

        jugador.ultimoChequeoOnline =
          new Date(
            ahora
          ).toISOString();

        jugador.juegoActual =
          presencia.juego;

        jugador.plataformaActual =
          presencia.plataforma;

        huboCambios =
          true;

        continue;
      }

      // ========================================
      // TIEMPO DESDE EL ÚLTIMO CHEQUEO
      // ========================================

      const ultimoChequeo =
        jugador
          .ultimoChequeoOnline
          ? new Date(
              jugador.ultimoChequeoOnline
            ).getTime()
          : ahora;

      /*
       * Limitamos a 2 minutos para evitar
       * que una caída/reiniciada del bot
       * contabilice horas de golpe.
       */
      const minutosTranscurridos =
        Math.max(
          0,
          Math.min(
            2,
            (
              ahora -
              ultimoChequeo
            ) / 60000
          )
        );

      // ========================================
      // SIGUE ONLINE
      // ========================================

      if (
        estabaOnline &&
        estaOnline
      ) {

        const stats =
          obtenerStatsDeHoy(
            jugador
          );

        stats.minutosOnline =
          Number(
            stats.minutosOnline ||
            0
          ) +
          minutosTranscurridos;

        huboCambios =
          true;
      }

      // ========================================
      // OFFLINE -> ONLINE
      // ========================================

      if (
        !estabaOnline &&
        estaOnline
      ) {

        jugador.onlineSince =
          new Date(
            ahora
          ).toISOString();

        huboCambios =
          true;

        console.log(
          `🟢 ${jugador.nombre} está ONLINE en PSN`
        );
      }

      // ========================================
      // ONLINE -> OFFLINE
      // ========================================

      if (
        estabaOnline &&
        !estaOnline
      ) {

        jugador.onlineSince =
          null;

        huboCambios =
          true;

        console.log(
          `🔴 ${jugador.nombre} está OFFLINE en PSN`
        );
      }

      // ========================================
      // ACTUALIZAR DATOS
      // ========================================

      if (
        jugador.online !==
        estaOnline
      ) {
        huboCambios =
          true;
      }

      jugador.online =
        estaOnline;

      jugador.juegoActual =
        presencia.juego;

      jugador.plataformaActual =
        presencia.plataforma;

      jugador.ultimoChequeoOnline =
        new Date(
          ahora
        ).toISOString();

      void discordId;
    }

    if (
      huboCambios
    ) {
      guardarBaseDeDatos();
    }

  } catch (error) {

    console.error(
      "Error actualizando presencias PSN:",
      error?.message ||
      error
    );

  } finally {

    actualizandoPresencias =
      false;
  }

  /*
   * Siempre actualizamos el panel,
   * incluso si no hubo cambios.
   */
  await actualizarMensajeOnlineTribe();
}

function iniciarMonitorPSN() {

  /*
   * Primer chequeo 5 segundos después
   * de conectar Discord.
   */
  setTimeout(
    () => {
      actualizarPresencias()
        .catch(error => {
          console.error(
            "Error en el primer chequeo PSN:",
            error
          );
        });
    },
    5000
  );

  /*
   * Después, exactamente cada minuto.
   */
  setInterval(
    () => {
      actualizarPresencias()
        .catch(error => {
          console.error(
            "Error en el monitor PSN:",
            error
          );
        });
    },
    ONLINE_UPDATE_INTERVAL
  );
}

// ==========================================
// PERFORMANCE
// ==========================================

function crearPerformanceEmbed(
  usuario,
  jugador
) {

  const stats =
    obtenerStatsDeHoy(
      jugador
    );

  const nota =
    calcularNota(
      stats
    );

  const barra =
    crearBarraDePerformance(
      nota
    );

  const estadoPSN =
    jugador.online === true
      ? "🟢 Online"
      : "🔴 Offline";

  const tiempoOnline =
    formatearHorasOnline(
      stats.minutosOnline
    );

  const embed =
    new EmbedBuilder()
      .setColor(0xffffff)
      .setTitle(
        `📊 Performance — ${jugador.nombre}`
      )
      .setThumbnail(
        PERFORMANCE_GIF
      )
      .addFields(

        {
          name:
            "🎮 PSN",
          value:
            jugador.psn ||
            "No vinculado",
          inline:
            true
        },

        {
          name:
            "Estado PSN",
          value:
            estadoPSN,
          inline:
            true
        },

        {
          name:
            "⏱️ Tiempo online PSN hoy",
          value:
            tiempoOnline,
          inline:
            false
        },

        {
          name:
            "Horas jugadas hoy",
          value:
            `${stats.horas} horas`,
          inline:
            false
        },

        {
          name:
            "🔫 Torretas",
          value:
            String(
              stats.torretas
            ),
          inline:
            true
        },

        {
          name:
            "🦖 Dinos",
          value:
            String(
              stats.dinos
            ),
          inline:
            true
        },

        {
          name:
            "💀 Jugadores",
          value:
            String(
              stats.jugadores
            ),
          inline:
            true
        },

        {
          name:
            "⭐ Nota",
          value:
            `${nota}/10\n${barra}`,
          inline:
            false
        }
      );

  if (
    jugador.juegoActual
  ) {
    embed.addFields({
      name:
        "🎮 Juego actual",
      value:
        jugador.juegoActual,
      inline:
        false
    });
  }

  if (
    jugador.plataformaActual
  ) {
    embed.addFields({
      name:
        "🕹️ Plataforma",
      value:
        jugador.plataformaActual,
      inline:
        true
    });
  }

  if (
    stats.captura
  ) {
    embed.setImage(
      stats.captura
    );
  }

  embed.setFooter({
    text:
      "ARK Tribe Performance",
    iconURL:
      PERFORMANCE_GIF
  });

  return embed;
}

// ==========================================
// COMANDOS
// ==========================================

const comandos = [

  new SlashCommandBuilder()
    .setName(
      "vincular"
    )
    .setDescription(
      "Vincula un jugador con su PSN"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador de Discord"
          )
          .setRequired(
            true
          )
    )

    .addStringOption(
      option =>
        option
          .setName(
            "psn"
          )
          .setDescription(
            "Nombre o ID de PSN"
          )
          .setRequired(
            true
          )
    )

    .addNumberOption(
      option =>
        option
          .setName(
            "horas"
          )
          .setDescription(
            "Horas jugadas hoy"
          )
          .setMinValue(
            0
          )
          .setRequired(
            false
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "horas"
    )
    .setDescription(
      "Actualiza las horas jugadas hoy"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador"
          )
          .setRequired(
            true
          )
    )

    .addNumberOption(
      option =>
        option
          .setName(
            "cantidad"
          )
          .setDescription(
            "Cantidad de horas"
          )
          .setMinValue(
            0
          )
          .setRequired(
            true
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "registrar-stats"
    )
    .setDescription(
      "Registra las estadísticas del día"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador"
          )
          .setRequired(
            true
          )
    )

    .addIntegerOption(
      option =>
        option
          .setName(
            "torretas"
          )
          .setDescription(
            "Torretas rotas"
          )
          .setMinValue(
            0
          )
          .setRequired(
            true
          )
    )

    .addIntegerOption(
      option =>
        option
          .setName(
            "dinos"
          )
          .setDescription(
            "Dinos matados"
          )
          .setMinValue(
            0
          )
          .setRequired(
            true
          )
    )

    .addIntegerOption(
      option =>
        option
          .setName(
            "jugadores"
          )
          .setDescription(
            "Jugadores matados"
          )
          .setMinValue(
            0
          )
          .setRequired(
            true
          )
    )

    .addIntegerOption(
      option =>
        option
          .setName(
            "nota"
          )
          .setDescription(
            "Nota del 1 al 10"
          )
          .setMinValue(
            1
          )
          .setMaxValue(
            10
          )
          .setRequired(
            false
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "subir-foto"
    )
    .setDescription(
      "Sube la foto de un jugador"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador"
          )
          .setRequired(
            true
          )
    )

    .addAttachmentOption(
      option =>
        option
          .setName(
            "foto"
          )
          .setDescription(
            "Foto del jugador"
          )
          .setRequired(
            true
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "subir-captura"
    )
    .setDescription(
      "Guarda una captura de estadísticas"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador"
          )
          .setRequired(
            true
          )
    )

    .addAttachmentOption(
      option =>
        option
          .setName(
            "captura"
          )
          .setDescription(
            "Captura de las estadísticas"
          )
          .setRequired(
            true
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "performance"
    )
    .setDescription(
      "Muestra la performance de un jugador"
    )

    .addUserOption(
      option =>
        option
          .setName(
            "jugador"
          )
          .setDescription(
            "Jugador"
          )
          .setRequired(
            true
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "tribu"
    )
    .setDescription(
      "Muestra todos los jugadores"
    ),

  new SlashCommandBuilder()
    .setName(
      "online-tribe"
    )
    .setDescription(
      "Crea o actualiza el panel fijo de jugadores online"
    ),

  new SlashCommandBuilder()
    .setName(
      "embed"
    )
    .setDescription(
      "Publica un embed personalizado"
    )
    .addStringOption(
      option =>
        option
          .setName(
            "titulo"
          )
          .setDescription(
            "Título del embed"
          )
          .setMaxLength(
            256
          )
          .setRequired(
            true
          )
    )
    .addStringOption(
      option =>
        option
          .setName(
            "descripcion"
          )
          .setDescription(
            "Descripción del embed"
          )
          .setMaxLength(
            4096
          )
          .setRequired(
            true
          )
    )
    .addAttachmentOption(
      option =>
        option
          .setName(
            "imagen-arriba"
          )
          .setDescription(
            "Imagen pequeña arriba a la derecha"
          )
          .setRequired(
            false
          )
    )
    .addAttachmentOption(
      option =>
        option
          .setName(
            "imagen-abajo"
          )
          .setDescription(
            "Imagen grande debajo del texto"
          )
          .setRequired(
            false
          )
    )
    .addStringOption(
      option =>
        option
          .setName(
            "color"
          )
          .setDescription(
            "Color hexadecimal, por ejemplo #5865F2"
          )
          .setRequired(
            false
          )
    )

].map(
  comando =>
    comando.toJSON()
);// ==========================================
// REGISTRO DE COMANDOS
// ==========================================

async function registrarComandos() {
  const rest =
    new REST({
      version: "10"
    }).setToken(
      TOKEN
    );

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
// CLIENTE DISCORD
// ==========================================

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds
    ]
  });

client.once(
  "ready",
  () => {

    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    /*
     * Arrancamos el monitor PSN
     * después de conectar Discord.
     */
    iniciarMonitorPSN();
  }
);

// ==========================================
// INTERACCIONES
// ==========================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ========================================
      // SELECTOR DE /TRIBU
      // ========================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "selector-performance"
      ) {

        const discordId =
          interaction.values[0];

        const jugador =
          obtenerJugador(
            discordId
          );

        if (!jugador) {
          return interaction.reply({
            content:
              "Ese jugador no existe.",
            ephemeral:
              true
          });
        }

        const usuario =
          await client.users
            .fetch(discordId)
            .catch(
              () => null
            );

        if (!usuario) {
          return interaction.reply({
            content:
              "No he podido encontrar al usuario.",
            ephemeral:
              true
          });
        }

        return interaction.reply({
          embeds: [
            crearPerformanceEmbed(
              usuario,
              jugador
            )
          ],
          ephemeral:
            true
        });
      }

      // ========================================
      // SOLO CHAT INPUT
      // ========================================

      if (
        !interaction.isChatInputCommand()
      ) {
        return;
      }

      const comando =
        interaction.commandName;

      // ========================================
      // COMANDOS PROTEGIDOS
      // ========================================

      const comandosProtegidos = [
        "vincular",
        "horas",
        "registrar-stats",
        "subir-foto",
        "subir-captura",
        "online-tribe",
        "embed"
      ];

      if (
        comandosProtegidos.includes(
          comando
        ) &&
        !esOwner(
          interaction
        )
      ) {

        return interaction.reply({
          content:
            "Solo el owner o el rol owner puede modificar los datos.",
          ephemeral:
            true
        });
      }

      // ========================================
      // /VINCULAR
      // ========================================

      if (
        comando ===
        "vincular"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const psn =
          interaction.options.getString(
            "psn"
          );

        const horas =
          interaction.options.getNumber(
            "horas"
          );

        await interaction.deferReply({
          ephemeral:
            true
        });

        const jugadorAnterior =
          obtenerJugador(
            usuario.id
          );

        let psnAccountId =
          jugadorAnterior
            ?.psnAccountId ||
          null;

        /*
         * Si es un jugador nuevo o ha cambiado
         * su nombre de PSN, buscamos de nuevo
         * el accountId.
         */

        if (
          !jugadorAnterior ||
          jugadorAnterior.psn !==
            psn
        ) {

          psnAccountId =
            await obtenerAccountIdPSN(
              psn
            );
        }

        database.players[
          usuario.id
        ] = {

          nombre:
            usuario.globalName ||
            usuario.username,

          psn:
            psn,

          psnAccountId:
            psnAccountId,

          foto:
            jugadorAnterior?.foto ||
            usuario.displayAvatarURL({
              extension:
                "png",
              size:
                256
            }),

          daily:
            jugadorAnterior?.daily ||
            {},

          online:
            jugadorAnterior?.online,

          onlineSince:
            jugadorAnterior
              ?.onlineSince ||
            null,

          ultimoChequeoOnline:
            jugadorAnterior
              ?.ultimoChequeoOnline ||
            null,

          juegoActual:
            jugadorAnterior
              ?.juegoActual ||
            null,

          plataformaActual:
            jugadorAnterior
              ?.plataformaActual ||
            null
        };

        /*
         * Creamos la estructura del día actual.
         */

        obtenerStatsDeHoy(
          database.players[
            usuario.id
          ]
        );

        /*
         * Si se han introducido horas manualmente
         * las conservamos como antes.
         */

        if (
          horas !== null
        ) {

          const stats =
            obtenerStatsDeHoy(
              database.players[
                usuario.id
              ]
            );

          stats.horas =
            horas;
        }

        guardarBaseDeDatos();

        /*
         * Comprobación inmediata.
         *
         * Así no hay que esperar un minuto
         * para que el jugador aparezca
         * en ONLINE TRIBE.
         */

        await actualizarPresencias();

        if (
          !psnAccountId
        ) {

          return interaction.editReply({
            content:
              `${usuario} ha sido vinculado con PSN **${psn}**, pero no he podido encontrar su cuenta PSN.\n\nComprueba que el nombre de PSN sea correcto y que el perfil permita encontrar la cuenta.`
          });
        }

        return interaction.editReply({
          content:
            `${usuario} ha sido vinculado con PSN **${psn}** correctamente.\n\n🟢 El bot comprobará automáticamente su estado online cada minuto.`
        });
      }

      // ========================================
      // /HORAS
      // ========================================

      if (
        comando ===
        "horas"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const cantidad =
          interaction.options.getNumber(
            "cantidad"
          );

        const jugador =
          obtenerJugador(
            usuario.id
          );

        if (!jugador) {

          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral:
              true
          });
        }

        const stats =
          obtenerStatsDeHoy(
            jugador
          );

        stats.horas =
          cantidad;

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Horas de **${jugador.nombre}** actualizadas a **${cantidad}**.`,
          ephemeral:
            true
        });
      }

      // ========================================
      // /REGISTRAR-STATS
      // ========================================

      if (
        comando ===
        "registrar-stats"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const torretas =
          interaction.options.getInteger(
            "torretas"
          );

        const dinos =
          interaction.options.getInteger(
            "dinos"
          );

        const jugadores =
          interaction.options.getInteger(
            "jugadores"
          );

        const nota =
          interaction.options.getInteger(
            "nota"
          );

        const jugador =
          obtenerJugador(
            usuario.id
          );

        if (!jugador) {

          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral:
              true
          });
        }

        const stats =
          obtenerStatsDeHoy(
            jugador
          );

        stats.torretas =
          torretas;

        stats.dinos =
          dinos;

        stats.jugadores =
          jugadores;

        stats.nota =
          nota;

        stats.origen =
          "manual";

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Estadísticas de **${jugador.nombre}** guardadas.`,
          ephemeral:
            true
        });
      }

      // ========================================
      // /SUBIR-FOTO
      // ========================================

      if (
        comando ===
        "subir-foto"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const archivo =
          interaction.options.getAttachment(
            "foto"
          );

        if (
          !archivo.contentType ||
          !archivo.contentType.startsWith(
            "image/"
          )
        ) {

          return interaction.reply({
            content:
              "El archivo debe ser una imagen.",
            ephemeral:
              true
          });
        }

        const jugador =
          obtenerJugador(
            usuario.id
          );

        if (!jugador) {

          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral:
              true
          });
        }

        jugador.foto =
          archivo.url;

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Foto de **${jugador.nombre}** guardada.`,
          ephemeral:
            true
        });
      }

      // ========================================
      // /SUBIR-CAPTURA
      // ========================================

      if (
        comando ===
        "subir-captura"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const archivo =
          interaction.options.getAttachment(
            "captura"
          );

        if (
          !archivo.contentType ||
          !archivo.contentType.startsWith(
            "image/"
          )
        ) {

          return interaction.reply({
            content:
              "El archivo debe ser una imagen.",
            ephemeral:
              true
          });
        }

        const jugador =
          obtenerJugador(
            usuario.id
          );

        if (!jugador) {

          return interaction.reply({
            content:
              "Primero vincula al jugador usando `/vincular`.",
            ephemeral:
              true
          });
        }

        const stats =
          obtenerStatsDeHoy(
            jugador
          );

        stats.captura =
          archivo.url;

        stats.origen =
          "captura";

        guardarBaseDeDatos();

        return interaction.reply({
          content:
            `Captura de **${jugador.nombre}** guardada.`,
          ephemeral:
            true
        });
      }

      // ========================================
      // /PERFORMANCE
      // ========================================

      if (
        comando ===
        "performance"
      ) {

        const usuario =
          interaction.options.getUser(
            "jugador"
          );

        const jugador =
          obtenerJugador(
            usuario.id
          );

        if (!jugador) {

          return interaction.reply({
            content:
              "Ese jugador todavía no está vinculado.",
            ephemeral:
              true
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
      // /TRIBU
      // ========================================

      if (
        comando ===
        "tribu"
      ) {

        const jugadores =
          Object.entries(
            database.players
          )
          .slice(
            0,
            25
          )
          .map(
            ([
              id,
              jugador
            ]) => ({
              id,
              nombre:
                jugador.nombre
            })
          );

        if (
          jugadores.length ===
          0
        ) {

          return interaction.reply({
            content:
              "Todavía no hay jugadores vinculados.",
            ephemeral:
              true
          });
        }

        const menu =
          new StringSelectMenuBuilder()
            .setCustomId(
              "selector-performance"
            )
            .setPlaceholder(
              "Selecciona un jugador"
            )
            .addOptions(
              jugadores.map(
                jugador =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(
                      jugador.nombre
                        .slice(
                          0,
                          100
                        )
                    )
                    .setValue(
                      jugador.id
                    )
                    .setDescription(
                      "Ver performance de hoy"
                    )
              )
            );

        const embed =
          new EmbedBuilder()
            .setColor(
              0xffffff
            )
            .setTitle(
              "Performance de la tribu"
            )
            .setDescription(
              "Selecciona un miembro para ver todas sus estadísticas de hoy."
            )
            .setFooter({
              text:
                "ARK Tribe Performance",
              iconURL:
                PERFORMANCE_GIF
            });

        return interaction.reply({
          embeds: [
            embed
          ],
          components: [
            new ActionRowBuilder()
              .addComponents(
                menu
              )
          ]
        });
      }      // ========================================
      // /ONLINE-TRIBE
      // ========================================

      if (
        comando ===
        "online-tribe"
      ) {

        const canal =
          interaction.channel;

        if (
          !canal ||
          !canal.isTextBased()
        ) {

          return interaction.reply({
            content:
              "No puedo crear el panel en este canal.",
            ephemeral:
              true
          });
        }

        await interaction.deferReply({
          ephemeral:
            true
        });

        let mensaje =
          null;

        /*
         * Si ya existe un panel configurado
         * en este canal, intentamos reutilizar
         * el mismo mensaje.
         */

        if (
          database.onlineTribe?.channelId ===
            canal.id &&
          database.onlineTribe?.messageId
        ) {

          mensaje =
            await canal.messages
              .fetch(
                database.onlineTribe.messageId
              )
              .catch(
                () => null
              );
        }

        /*
         * Si encontramos el mensaje,
         * lo editamos.
         *
         * Si no existe, creamos uno nuevo.
         */

        if (mensaje) {

          await mensaje.edit({
            embeds: [
              crearOnlineTribeEmbed()
            ]
          });

        } else {

          mensaje =
            await canal.send({
              embeds: [
                crearOnlineTribeEmbed()
              ]
            });
        }

        /*
         * Guardamos canal + mensaje.
         *
         * De esta manera, aunque el bot se reinicie,
         * sabrá qué mensaje tiene que actualizar.
         */

        database.onlineTribe = {
          channelId:
            canal.id,

          messageId:
            mensaje.id
        };

        guardarBaseDeDatos();

        /*
         * Hacemos una consulta inmediata a PSN
         * para que el panel no tenga que esperar
         * al siguiente ciclo de 60 segundos.
         */

        await actualizarPresencias();

        return interaction.editReply({
          content:
            "✅ **ONLINE TRIBE configurado correctamente.**\n\n" +
            "El mismo mensaje se actualizará automáticamente cada minuto.\n" +
            "Los nuevos jugadores vinculados aparecerán automáticamente."
        });
      }

      // ========================================
      // /EMBED
      // ========================================

      if (
        comando ===
        "embed"
      ) {
        const titulo =
          interaction.options.getString(
            "titulo"
          );

        const descripcion =
          interaction.options.getString(
            "descripcion"
          );

        const imagenArriba =
          interaction.options.getAttachment(
            "imagen-arriba"
          );

        const imagenAbajo =
          interaction.options.getAttachment(
            "imagen-abajo"
          );

        const colorTexto =
          interaction.options.getString(
            "color"
          ) ||
          "#5865F2";

        const color =
          obtenerColorEmbed(
            colorTexto
          );

        if (
          color === null
        ) {
          return interaction.reply({
            content:
              "El color debe ser hexadecimal válido, por ejemplo `#5865F2`.",
            ephemeral:
              true
          });
        }

        if (
          (
            imagenArriba &&
            !esImagenAdjunta(
              imagenArriba
            )
          ) ||
          (
            imagenAbajo &&
            !esImagenAdjunta(
              imagenAbajo
            )
          )
        ) {
          return interaction.reply({
            content:
              "Las imágenes adjuntas deben ser archivos de imagen.",
            ephemeral:
              true
          });
        }

        const embed =
          new EmbedBuilder()
            .setColor(
              color
            )
            .setTitle(
              titulo
            )
            .setDescription(
              descripcion
            );

        if (
          imagenArriba
        ) {
          embed.setThumbnail(
            imagenArriba.url
          );
        }

        if (
          imagenAbajo
        ) {
          embed.setImage(
            imagenAbajo.url
          );
        }

        return interaction.reply({
          embeds: [
            embed
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
        ephemeral:
          true
      };

      /*
       * Discord no permite responder dos veces
       * a la misma interacción.
       */

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction
          .followUp(
            respuesta
          )
          .catch(
            () => {}
          );

      } else {

        await interaction
          .reply(
            respuesta
          )
          .catch(
            () => {}
          );
      }
    }
  }
);

// ==========================================
// ARRANQUE DEL BOT
// ==========================================

registrarComandos()
  .then(
    () => {
      return client.login(
        TOKEN
      );
    }
  )

  .then(
    () => {

      console.log(
        "🚀 Inicio completado."
      );

    }
  )

  .catch(
    error => {

      console.error(
        "❌ No se pudo iniciar el bot:",
        error
      );

      process.exit(
        1
      );
    }
  );
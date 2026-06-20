/* ============================================================
   Datos del juego (constantes inmutables).
   Cargado ANTES de game.js. Las funciones de game.js dependen
   de estas variables globales (C, SHORT, REC, DOUBLE, OPTIONAL).

   C       = catálogo de roles: nombre, equipo, emoji, imágenes, descripción.
   SHORT   = descripción corta de cada rol (UI guiada).
   REC     = nº mínimo de jugadores recomendado por rol.
   DOUBLE  = roles que pueden repartirse como carta doble.
   OPTIONAL= roles opcionales y si vienen activados por defecto.
   ============================================================ */
const IMG="https://aaldeiadormece.estaminestudio.com/img/";
const BACK="https://images.steamusercontent.com/ugc/2274945577069468636/192A59DBD78136EB151CD31E6E109C6BA6075707/?imw=512&imh=512&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false";
const LOGO=IMG+"baralho36.png";

const C={
  narrador:{n:"Narrador",t:"neutro",em:"📖",img:["baralho01"],d:"No juega: dirige y arbitra la partida."},
  lobo:{n:"Lobo",t:"lobo",em:"🐺",img:["baralho02","baralho03","baralho04","baralho05","baralho06"],d:"Cada noche devora a un aldeano con la manada."},
  loboAlfa:{n:"Lobo Alfa",t:"lobo",em:"👑🐺",img:["baralho07"],d:"Una vez por partida convierte a su víctima en lobo."},
  loboJudas:{n:"Lobo Judas",t:"lobo",em:"🗡️🐺",img:["baralho08"],d:"Mata con la manada; a solas puede matar a un lobo. Gana solo si es el único superviviente."},
  loboRojo:{n:"Lobo Rojo",t:"lobo",em:"🔴🐺",img:["baralho09"],d:"Mientras no muera ningún lobo, hace una 2ª víctima a solas."},
  aldeano:{n:"Aldeano",t:"aldea",em:"🧑‍🌾",img:["baralho10","baralho11","baralho12","baralho13","baralho14","baralho15","baralho16","baralho17","baralho18","baralho19"],d:"Sin poderes. Analiza y persuade."},
  vidente:{n:"Vidente",t:"aldea",em:"🔮",img:["baralho20"],d:"Cada noche descubre si un jugador es lobo o aldeano."},
  borracho:{n:"Borracho",t:"aldea",em:"🍷",img:["baralho21"],d:"Gana si le linchan en la 1ª votación haciéndose pasar por lobo."},
  bruja:{n:"Bruja",t:"aldea",em:"🧙‍♀️",img:["baralho22"],d:"Una poción de vida y una de muerte, cada una una vez."},
  cazador:{n:"Cazador",t:"aldea",em:"🏹",img:["baralho23"],d:"Al morir, elimina al instante a otro jugador a su elección."},
  careto:{n:"Careto",t:"aldea",em:"🎭",img:["baralho24"],d:"Una noche intercambia dos cartas. Incompatible con Niño Salvaje."},
  cupido:{n:"Cupido",t:"aldea",em:"💘",img:["baralho25"],d:"La 1ª noche enamora a dos jugadores; si uno muere, el otro también."},
  heredera:{n:"Heredera",t:"aldea",em:"👑",img:["baralho26"],d:"Antes del linchamiento puede asumir la carta del condenado."},
  inquisidor:{n:"Inquisidor",t:"aldea",em:"⚖️",img:["baralho27"],d:"Acusa a varios; si acierta gana, si falla muere él."},
  jabali:{n:"Jabalí",t:"aldea",em:"🐗",img:["baralho28"],d:"Si un lobo se vuelve su vecino, el narrador lo anuncia."},
  ladron:{n:"Ladrón",t:"aldea",em:"💰",img:["baralho29"],d:"La 1ª noche ve 2 cartas sobrantes y puede cambiar la suya (o intercambiar con otro jugador)."},
  medium:{n:"Médium",t:"aldea",em:"👻",img:["baralho30"],d:"El último muerto le comunica una letra."},
  nina:{n:"Niña",t:"aldea",em:"👧",img:["baralho31"],d:"Puede espiar a los lobos de noche; si la pillan, muere."},
  ninoSalvaje:{n:"Niño Salvaje",t:"aldea",em:"🧒",img:["baralho32"],d:"Elige un Modelo; si su Modelo muere, se vuelve lobo."},
  policia:{n:"Policía",t:"aldea",em:"👮",img:["baralho33"],d:"Una vez detiene y una vez da inmunidad."},
  zorro:{n:"Zorro",t:"aldea",em:"🦊",img:["baralho34"],d:"Comprueba si hay un lobo en un trío de vecinos."},
  rata:{n:"Rata",t:"aldea",em:"🐀",img:["baralho35"],d:"Si muere de noche, infecta al primer lobo a su izquierda."},
  insignia:{n:"Alguacil/Insignia",t:"neutro",em:"🏅",img:["baralho36"],d:"Voto doble; decide los empates. Se entrega además del personaje."}
};
const SHORT={
  vidente:"Ve si un jugador es lobo cada noche.",loboAlfa:"Una vez convierte a su víctima en lobo.",loboJudas:"Mata lobos; gana si queda solo.",loboRojo:"Hace una 2ª víctima cada noche.",
  bruja:"Una poción de vida y una de muerte.",cazador:"Al morir, se lleva a otro jugador.",cupido:"Enamora a dos jugadores.",borracho:"Gana si le linchan en la 1ª ronda.",
  jabali:"Avisa si un lobo es su vecino.",zorro:"Comprueba si hay lobo en un trío.",policia:"Detiene y da inmunidad.",nina:"Puede espiar a los lobos de noche.",
  ninoSalvaje:"Si muere su Modelo, se vuelve lobo.",heredera:"Hereda la carta del linchado.",inquisidor:"Acusa: acierta o muere.",careto:"Intercambia dos cartas una noche.",
  medium:"Habla con el último muerto.",ladron:"Ve 2 cartas sobrantes y puede cambiar la suya.",rata:"Al morir de noche infecta a un lobo.",insignia:"Voto doble; decide los empates."
};
const REC={
  vidente:{min:5,hint:""},nina:{min:5,hint:""},cupido:{min:5,hint:""},bruja:{min:5,hint:""},cazador:{min:5,hint:""},insignia:{min:5,hint:""},
  borracho:{min:7,hint:"Más divertida con 7+ jugadores"},jabali:{min:8,hint:"Mejor con 8+ jugadores"},ladron:{min:8,hint:"Mejor con 8+ jugadores"},
  heredera:{min:8,hint:"Mejor con 8+ jugadores"},medium:{min:8,hint:"Más útil con 8+ jugadores"},loboAlfa:{min:8,hint:"Refuerza a los lobos: mejor con 8+"},
  careto:{min:9,hint:"Mejor con 9+ jugadores"},zorro:{min:10,hint:"Mejor con 10+ jugadores"},inquisidor:{min:10,hint:"Mejor con 10+ jugadores"},
  loboJudas:{min:10,hint:"Mejor con 10+ jugadores"},ninoSalvaje:{min:12,hint:"Mejor con 12+ jugadores"},rata:{min:12,hint:"Mejor con 12+ jugadores"},
  policia:{min:15,hint:"Mejor con 15+ (junto a la Bruja)"},loboRojo:{min:15,hint:"Solo con 15+ jugadores"}
};
const DOUBLE=new Set(["insignia","loboAlfa","ninoSalvaje","heredera","careto","ladron"]);
const OPTIONAL=[
  ["nina",true],["vidente",false],["bruja",false],["cazador",false],["cupido",false],["borracho",false],
  ["jabali",false],["zorro",false],["policia",false],["loboAlfa",false],["loboJudas",false],["loboRojo",false],
  ["ninoSalvaje",false],["heredera",false],["inquisidor",false],["careto",false],["medium",false],["ladron",false],["rata",false],["insignia",false]
];

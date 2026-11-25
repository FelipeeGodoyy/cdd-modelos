(function () {
  "use strict";
  const R = DATOS.resultados;
  const M = DATOS.modelos;
  const COL = { dummy: "#8a94a0", arbol: "#2f5da8", bosque: "#b0457b", mlp: "#d9822b", verde: "#1d5c4e", hilo: "#cf432c", cinta: "#f2c230" };
  const NOMBRE = { dummy: "Dummy", arbol: "Árbol", bosque: "Bosque", mlp: "MLP" };
  const GRUPO = "completo_sin_largo";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 0) => Number(v).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 0) => num(v * 100, d) + " %";
  const dec = (v, d = 2) => num(v, d);

  /* ---------- equipo (editable, se guarda en el navegador) ---------- */
  const EQUIPO = [
    { rol: "Dominio y problema", nombre: "Eliel Lanzillotta" },
    { rol: "Arquitectura y datos", nombre: "Nicolas Iglesias" },
    { rol: "Análisis exploratorio", nombre: "Felipe Godoy" },
    { rol: "Técnica de minería", nombre: "Integrante 4" },
    { rol: "Conclusión y relato", nombre: "Integrante 5" },
    { rol: "Aplicación funcional", nombre: "Bautista Gil Roces" },
  ];
  try {
    const guardado = JSON.parse(localStorage.getItem("cdd_equipo") || "null");
    if (Array.isArray(guardado)) guardado.forEach((g, i) => { if (EQUIPO[i] && g && g.nombre) EQUIPO[i].nombre = g.nombre; });
    if (localStorage.getItem("cdd_equipo_nombres_v1") !== "1") {
      EQUIPO[0].nombre = "Eliel Lanzillotta";
      EQUIPO[1].nombre = "Nicolas Iglesias";
      localStorage.setItem("cdd_equipo", JSON.stringify(EQUIPO));
      localStorage.setItem("cdd_equipo_nombres_v1", "1");
    }
  } catch (e) { /* sin almacenamiento: se usan los nombres por defecto */ }
  const guardarEquipo = () => { try { localStorage.setItem("cdd_equipo", JSON.stringify(EQUIPO)); } catch (e) { /* ignorar */ } };

  /* ---------- simulador: de la descripción del chat al vector de 56 variables ---------- */
  const FAM = DATOS.familias_ids;
  const FAM_NOMBRE = DATOS.familias_nombres;
  const VISIBLES = ["broches", "ambos", "chalecos", "cintas", "elasticos"];
  const FAM_SIM = FAM.map((id, i) => [id, FAM_NOMBRE[i]]).filter(([id]) => VISIBLES.includes(id));
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const sim = { pide: new Set(["broches"]), ofrece: new Set(["broches"]), dia: 1, hora: 15, texto: 1, media: 0, bot: 1, seg: 12 };

  const enHorario = (dia, hora) => dia <= 4 && ((hora >= 8 && hora <= 12) || (hora >= 14 && hora <= 17));

  function vectorDe(s) {
    const f = {};
    const pide = FAM.filter((id) => s.pide.has(id));
    const ofrece = FAM.filter((id) => s.ofrece.has(id));
    const coincide = pide.filter((id) => s.ofrece.has(id));
    for (const id of FAM) {
      f["requested_" + id] = s.pide.has(id) ? 1 : 0;
      f["offered_" + id] = s.ofrece.has(id) ? 1 : 0;
      f["matched_" + id] = s.pide.has(id) && s.ofrece.has(id) ? 1 : 0;
    }
    f.requested_family_count = pide.length;
    f.offered_family_count = ofrece.length;
    f.matched_family_count = coincide.length;
    f.request_family_detected = pide.length > 0 ? 1 : 0;
    f.request_family_not_detected = pide.length > 0 ? 0 : 1;
    f.offer_family_detected = ofrece.length > 0 ? 1 : 0;
    f.offer_family_not_detected = ofrece.length > 0 ? 0 : 1;
    f.has_matching_family = coincide.length > 0 ? 1 : 0;
    f.has_unmatched_request = pide.some((id) => !s.ofrece.has(id)) ? 1 : 0;
    f.has_additional_offer = ofrece.some((id) => !s.pide.has(id)) ? 1 : 0;
    f.request_text_available = s.texto > 0 ? 1 : 0;
    f.prefix_inbound = s.texto + s.media;
    f.prefix_bot_messages = s.bot;
    f.prefix_messages = s.texto + s.media + s.bot;
    f.prefix_duration_seconds = s.seg;
    f.hour = s.hora;
    f.weekday = s.dia;
    f.business_hours = enHorario(s.dia, s.hora) ? 1 : 0;
    f.inbound_text_messages = s.texto;
    f.inbound_nontext_messages = s.media;
    return DATOS.columnas.map((c) => {
      if (f[c] === undefined) throw new Error("Falta la variable " + c);
      return f[c];
    });
  }

  const EJEMPLOS = [
    { nombre: "Pide broches, el bot ofrece broches", pide: ["broches"], ofrece: ["broches"] },
    { nombre: "Pide ambos, el bot ofrece ambos", pide: ["ambos"], ofrece: ["ambos"] },
    { nombre: "Consulta sin producto", pide: [], ofrece: [] },
  ];

  /* ---------- descripción de reglas del árbol ---------- */
  const BIN = new Set(DATOS.binarias);
  const etiqueta = (i) => DATOS.etiquetas[DATOS.columnas[i]];
  function reglaTexto(paso) {
    const col = DATOS.columnas[paso.variable];
    if (BIN.has(col)) return etiqueta(paso.variable) + ": " + (paso.izquierda ? "no" : "sí");
    return etiqueta(paso.variable) + (paso.izquierda ? " ≤ " : " > ") + num(paso.umbral, 1);
  }

  /* ---------- gráficos SVG ---------- */
  const svg = (w, h, dentro) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${dentro}</svg>`;

  function graficoFamilias() {
    const filas = R.familias.filter((f) => f.tasa !== null).sort((a, b) => b.tasa - a.tasa);
    const w = 1040, fila = 44, x0 = 330, ancho = 560, h = filas.length * fila + 84;
    let s = "";
    s += `<line class="rejilla" x1="${x0 + ancho / 2}" x2="${x0 + ancho / 2}" y1="20" y2="${h - 40}"/>`;
    s += `<text class="chico suave" x="${x0 + ancho / 2}" y="14" text-anchor="middle" font-size="21">mitad de los chats</text>`;
    filas.forEach((f, i) => {
      const y = 40 + i * fila;
      const chica = f.episodios < 30;
      const color = f.tasa < 0.35 ? COL.verde : f.tasa > 0.6 ? COL.hilo : COL.dummy;
      s += `<g opacity="${chica ? 0.42 : 1}">`;
      s += `<text x="${x0 - 18}" y="${y + 23}" text-anchor="end" font-size="26" font-weight="600">${esc(f.nombre)}</text>`;
      s += `<rect x="${x0}" y="${y}" width="${f.tasa * ancho}" height="30" fill="${color}" rx="3"/>`;
      s += `<text x="${x0 + f.tasa * ancho + 12}" y="${y + 24}" font-size="26" font-weight="700" class="disp">${pct(f.tasa)}</text>`;
      s += `<text x="${w - 4}" y="${y + 23}" text-anchor="end" font-size="22" class="suave">${num(f.episodios)} chats${chica ? "*" : ""}</text>`;
      s += `</g>`;
    });
    s += `<text x="0" y="${h - 8}" font-size="22" class="suave">* Menos de 30 chats: no sacar conclusiones.</text>`;
    return svg(w, h, s);
  }

  function graficoAblacion() {
    const w = 1040, h = 610, izq = 72, arriba = 54, abajo = 150, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - (v - 0.4) / 0.6);
    const grupos = [
      ["operativas", ["Operativas +", "largo del mensaje", "(10)"]],
      ["operativas_sin_largo", ["Solo operativas", "(9)"]],
      ["completo", ["Todas", "(58, protocolo)"]],
      ["completo_sin_largo", ["Todas menos", "largo de texto", "(56)"]],
    ];
    const gw = (w - izq - 10) / 4;
    let s = "";
    for (let v = 0.4; v <= 1.0001; v += 0.1) {
      s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${dec(v, 1)}</text>`;
    }
    s += `<rect x="${izq + gw * 3 + 6}" y="${arriba - 14}" width="${gw - 12}" height="${alto + 14}" fill="#cfe3d9" opacity=".75" rx="4"/>`;
    const orden = ["arbol", "bosque", "mlp"];
    grupos.forEach(([g, etiquetas], gi) => {
      orden.forEach((m, mi) => {
        const v = R.metricas[g][m].ap;
        const bx = izq + gi * gw + (gw - 3 * 60 - 2 * 8) / 2 + mi * 68;
        s += `<rect x="${bx}" y="${y(v)}" width="60" height="${y(0.4) - y(v)}" fill="${COL[m]}" rx="3"/>`;
        s += `<text x="${bx + 30}" y="${y(v) - 9}" text-anchor="middle" font-size="24" font-weight="700" class="disp">${dec(v, 2)}</text>`;
      });
      etiquetas.forEach((t, ti) => { s += `<text x="${izq + gi * gw + gw / 2}" y="${h - abajo + 36 + ti * 29}" text-anchor="middle" font-size="25" font-weight="${ti === 0 ? 600 : 400}">${esc(t)}</text>`; });
    });
    const azar = R.metricas.completo_sin_largo.dummy.ap;
    s += `<line x1="${izq}" x2="${w - 10}" y1="${y(azar)}" y2="${y(azar)}" stroke="#18222d" stroke-width="3" stroke-dasharray="10 7"/>`;
    s += `<line x1="${izq + 460}" x2="${izq + 496}" y1="21" y2="21" stroke="#18222d" stroke-width="3" stroke-dasharray="8 5"/><text x="${izq + 506}" y="29" font-size="24" font-weight="600">Azar ${dec(azar, 2)}</text>`;
    orden.forEach((m, i) => { s += `<rect x="${izq + i * 150}" y="10" width="22" height="22" fill="${COL[m]}" rx="3"/><text x="${izq + i * 150 + 32}" y="29" font-size="24" font-weight="600">${NOMBRE[m]}</text>`; });
    return svg(w, h, s);
  }

  function graficoModelos() {
    const w = 1000, h = 540, izq = 72, arriba = 30, abajo = 80, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - (v - 0.4) / 0.6);
    const orden = ["dummy", "arbol", "bosque", "mlp"], gw = (w - izq - 10) / orden.length;
    let s = "";
    for (let v = 0.4; v <= 1.0001; v += 0.1) {
      s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${dec(v, 1)}</text>`;
    }
    orden.forEach((m, i) => {
      const r = R.metricas[GRUPO][m], cx = izq + i * gw + gw / 2;
      s += `<rect x="${cx - 62}" y="${y(r.ap)}" width="124" height="${y(0.4) - y(r.ap)}" fill="${COL[m]}" rx="4"/>`;
      s += `<line x1="${cx}" x2="${cx}" y1="${y(r.ic_alto)}" y2="${y(r.ic_bajo)}" stroke="#18222d" stroke-width="3"/><line x1="${cx - 14}" x2="${cx + 14}" y1="${y(r.ic_alto)}" y2="${y(r.ic_alto)}" stroke="#18222d" stroke-width="3"/><line x1="${cx - 14}" x2="${cx + 14}" y1="${y(r.ic_bajo)}" y2="${y(r.ic_bajo)}" stroke="#18222d" stroke-width="3"/>`;
      s += `<text x="${cx}" y="${y(r.ic_alto) - 12}" text-anchor="middle" font-size="30" font-weight="700" class="disp">${dec(r.ap, 2)}</text>`;
      s += `<text x="${cx}" y="${h - abajo + 40}" text-anchor="middle" font-size="28" font-weight="600">${NOMBRE[m]}</text>`;
    });
    return svg(w, h, s);
  }

  function graficoGrupos() {
    const filas = R.tramos[GRUPO + "/bosque"].filas;
    const w = 1000, h = 470, izq = 60, arriba = 40, abajo = 100, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - v);
    const gw = (w - izq - 10) / filas.length;
    let s = "";
    for (let v = 0; v <= 1.0001; v += 0.25) s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${Math.round(v * 100)}</text>`;
    filas.forEach((f, i) => {
      const cx = izq + i * gw + gw / 2;
      const color = f.tasa_respuesta > 0.6 ? COL.hilo : f.tasa_respuesta < 0.3 ? COL.verde : COL.dummy;
      s += `<rect x="${cx - 58}" y="${y(f.tasa_respuesta)}" width="116" height="${y(0) - y(f.tasa_respuesta)}" fill="${color}" rx="4"/>`;
      s += `<text x="${cx}" y="${y(f.tasa_respuesta) - 11}" text-anchor="middle" font-size="36" font-weight="700" class="disp">${Math.round(f.tasa_respuesta * 100)} %</text>`;
      const nombres = ["Más alto", "Alto", "Medio", "Bajo", "Más bajo"];
      s += `<text x="${cx}" y="${h - abajo + 40}" text-anchor="middle" font-size="28" font-weight="700">${nombres[i] || "Tramo " + (i + 1)}</text>`;
      s += `<text x="${cx}" y="${h - abajo + 70}" text-anchor="middle" font-size="22" class="suave">${i * 20}–${(i + 1) * 20} %</text>`;
    });
    return svg(w, h, s);
  }

  function graficoBloques() {
    const filas = [...R.bloques].sort((a, b) => b.caida_ap - a.caida_ap);
    const w = 1000, fila = 64, h = filas.length * fila + 20, x0 = 330, maximo = Math.max(...filas.map((f) => f.caida_ap));
    let s = "";
    filas.forEach((f, i) => {
      const y = 10 + i * fila, l = (f.caida_ap / maximo) * 520;
      s += `<text x="${x0 - 18}" y="${y + 33}" text-anchor="end" font-size="26" font-weight="600">${esc(f.bloque)}</text>`;
      s += `<rect x="${x0}" y="${y + 6}" width="${l}" height="40" fill="${f.bloque === "Operativas" ? COL.dummy : COL.verde}" rx="3"/>`;
      s += `<text x="${x0 + l + 12}" y="${y + 36}" font-size="25" font-weight="700" class="disp">${dec(f.caida_ap, 3)}</text>`;
    });
    return svg(w, h, s);
  }

  /* ---------- árbol navegable ---------- */
  function arbolHTML(camino) {
    const a = M.arbol;
    const enCamino = new Set(camino.pasos.map((p) => p.nodo));
    enCamino.add(camino.hoja);
    const colorProb = (p) => (p >= 0.7 ? "#cf432c" : p <= 0.3 ? "#1d5c4e" : "#8a94a0");
    function rec(i, ramaTxt, ramaClase, profundidad) {
      const rama = ramaTxt ? `<span class="rama ${ramaClase}">${esc(ramaTxt)}</span>` : "";
      const marca = enCamino.has(i) ? " en-camino" : "";
      if (a.f[i] < 0) {
        const p = a.pn[i];
        return `<div class="hoja-nodo${marca}">${rama}<span class="prob-hoja" style="background:${colorProb(p)}">${pct(p)}</span> ${p >= 0.5 ? "interviene una persona" : "lo resuelve el bot"} <span class="chico">(${num(a.n[i])} chats de entrenamiento)</span></div>`;
      }
      const col = DATOS.columnas[a.f[i]];
      const binaria = BIN.has(col);
      const pregunta = binaria ? esc(etiqueta(a.f[i])) + "?" : esc(etiqueta(a.f[i])) + " ≤ " + num(a.t[i], 1) + "?";
      const abierto = profundidad < 2 || enCamino.has(i) ? " open" : "";
      return `<details class="${marca}"${abierto}><summary>${rama}${pregunta}</summary>` +
        rec(a.l[i], binaria ? "No" : "Sí", binaria ? "no" : "si", profundidad + 1) +
        rec(a.r[i], binaria ? "Sí" : "No", binaria ? "si" : "no", profundidad + 1) + `</details>`;
    }
    return rec(0, "", "", 0);
  }

  /* ---------- diapositivas ---------- */
  const top20 = () => R.top_k[GRUPO + "/bosque"].find((f) => f.fraccion === 0.2);
  const ap = (g, m) => R.metricas[g][m].ap;

  function etiquetaHTML(texto, quien) {
    const q = quien === null ? "" : `<span class="etq-quien">Presenta <b data-quien="${quien}">${esc(EQUIPO[quien].nombre)}</b></span>`;
    return `<div class="etiqueta"><span class="etq-nombre">${esc(texto)}</span>${q}</div>`;
  }

  function lineaDeTiempo() {
    const P = R.particiones, total = P.train.episodios + P.validation.episodios + P.test.episodios + P.purgado.episodios;
    const ancho = 1680, purga = P.purgado.episodios / 2;
    const w = (n) => Math.max(26, (n / total) * ancho);
    const tramos = [
      ["Train", `hasta el 31/8 · ${num(P.train.episodios)} chats`, P.train.episodios, "#1d5c4e", "#fff", "El modelo aprende acá"],
      ["", "", purga, "#8a94a0", "#fff", "purga"],
      ["Validation", `septiembre · ${num(P.validation.episodios)} chats`, P.validation.episodios, "#f2c230", "#18222d", "Se elige la configuración"],
      ["", "", purga, "#8a94a0", "#fff", "purga"],
      ["Test", `octubre · ${num(P.test.episodios)} chats`, P.test.episodios, "#cf432c", "#fff", "Nota final, una sola vez"],
    ];
    const suma = tramos.reduce((a, t) => a + w(t[2]), 0), k = ancho / suma;
    let x = 0, s = "";
    for (const [n, d, cant, fondo, texto, leyenda] of tramos) {
      const ww = w(cant) * k;
      s += `<rect x="${x}" y="22" width="${ww - 4}" height="78" fill="${fondo}" rx="4"/>`;
      if (n) {
        s += `<text x="${x + 18}" y="58" font-size="28" font-weight="700" class="disp" style="fill:${texto}">${n}</text>`;
        s += `<text x="${x + 18}" y="88" font-size="22" style="fill:${texto}">${d}</text>`;
        s += `<text x="${x + 2}" y="128" font-size="22" class="suave">${leyenda}</text>`;
      }
      x += ww;
    }
    return `<div style="margin-top:6px">${svg(ancho, 140, s)}</div>`;
  }

  function matrizHTML(id) {
    const r = R.metricas[GRUPO][id], max = Math.max(r.tn, r.fp, r.fn, r.tp);
    const cel = (v, acierto) => {
      const a = 0.14 + 0.7 * (v / max);
      const fondo = acierto ? `rgba(29,92,78,${a})` : `rgba(207,67,44,${a})`;
      return `<div class="mx-c" style="background:${fondo};color:${a > 0.5 ? "#fff" : "#18222d"}">${num(v)}</div>`;
    };
    return `<div class="mx"><div class="mx-n" style="color:${id === "dummy" ? "#46535f" : COL[id]}">${NOMBRE[id]}</div><div class="mx-g">
      <span></span><span class="mx-h">Dice: sin persona</span><span class="mx-h">Dice: con persona</span>
      <span class="mx-r">Real: sin persona</span>${cel(r.tn, true)}${cel(r.fp, false)}
      <span class="mx-r">Real: con persona</span>${cel(r.fn, false)}${cel(r.tp, true)}</div></div>`;
  }

  const tile = (valor, texto, clase = "") => `<div class="tile ${clase}"><div class="tile__v">${valor}</div><div class="tile__t">${texto}</div></div>`;
  const ACENTOS = { "Presentación final": "#1d5c4e", "Introducción": "#1d5c4e", "Hipótesis y resultado": "#1d5c4e", "Dominio y problema": "#1d5c4e", "Arquitectura de la solución": "#2f5da8", "Análisis exploratorio": "#d9822b", "Técnica de minería": "#b0457b", "Conclusión": "#cf432c", "Aplicación funcional": "#18222d", "Equipo y preguntas": "#1d5c4e", "Anexo": "#8a94a0" };

  function graficoMeses() {
    const meses = R.meses, w = 1040, h = 520, arriba = 92, abajo = 108, alto = h - arriba - abajo;
    const NOM = { "2026-03": "Mar", "2026-04": "Abr", "2026-05": "May", "2026-06": "Jun", "2026-07": "Jul", "2026-08": "Ago", "2026-09": "Sep", "2026-10": "Oct" };
    const maximo = Math.max(...meses.map((m) => m.chats)), gw = w / meses.length;
    let s = `<rect x="0" y="6" width="22" height="22" fill="#8a94a0" rx="3"/><text x="32" y="25" font-size="23" font-weight="600">Sin anuncios</text><rect x="210" y="6" width="22" height="22" fill="#d9822b" rx="3"/><text x="242" y="25" font-size="23" font-weight="600">Con anuncios</text><text x="440" y="25" font-size="22" class="suave">Debajo de cada mes: % de chats con anuncio</text>`;
    meses.forEach((m, i) => {
      const cx = i * gw + gw / 2, alt = Math.max(6, (m.chats / maximo) * alto), y = arriba + alto - alt;
      s += `<rect x="${cx - 44}" y="${y}" width="88" height="${alt}" fill="${m.con_anuncio > 0 ? "#d9822b" : "#8a94a0"}" rx="4"/>`;
      s += `<text x="${cx}" y="${y - 10}" text-anchor="middle" font-size="30" font-weight="700" class="disp">${num(m.chats)}</text>`;
      s += `<text x="${cx}" y="${arriba + alto + 36}" text-anchor="middle" font-size="27" font-weight="700">${NOM[m.mes]}</text>`;
      s += `<text x="${cx}" y="${arriba + alto + 66}" text-anchor="middle" font-size="22" class="suave">${Math.round(m.con_anuncio * 100)} %</text>`;
    });
    return svg(w, h, s);
  }

  const SLIDES = [];
  function slide(def) { SLIDES.push(def); }

  slide({
    clase: "portada", tag: "Presentación final", quien: null, min: 0.3, titulo: "",
    corto: "Portada",
    notas: ["Saludar y presentar al grupo en diez segundos.", "Anunciar el recorrido: primero quién es Hitelac y cuál es el problema, después la respuesta, y luego cómo llegamos a ella.", "Avisar que la presentación es también la aplicación: los modelos corren dentro de esta página."],
    html: () => `
      <h1 class="titulo">¿A qué chat le toca una persona primero?</h1>
      <p class="sub">Prioridad de atención en los chats de WhatsApp de Hitelac</p>
      <div class="equipo-lista">${EQUIPO.map((e, i) => `<div><b data-quien="${i}">${esc(e.nombre)}</b><span>${esc(e.rol)}</span></div>`).join("")}</div>
      <aside class="cartel">
        <div class="cartel-k">Trabajo Práctico Obligatorio</div>
        <div class="cartel-t">Ciencia de Datos</div>
        <div class="cartel-s">UADE · Docente: Santiago Martín</div>
        <div class="cartel-f">Defensa<br><b>26 de noviembre de 2026</b></div>
        <div class="cartel-cinta"></div>
      </aside>`,
  });

  slide({
    tag: "Introducción", quien: 0, min: 0.9, corto: "Quién es Hitelac",
    titulo: "Hitelac atiende por WhatsApp: primero responde un bot y, a veces, entra una persona",
    notas: ["Presentar a la empresa en una frase: importa telas e insumos de confección, también vende ambos médicos y chalecos, y va a sumar prendas y calzado.", "Contar el recorrido de un chat: anuncio en Meta, WhatsApp, bot con IA (que no ve fotos ni audios) y, en algunos casos, una persona.", "Cerrar con el problema: el gerente lee todos los chats para decidir cuáles atender primero."],
    html: () => {
      const productos = ["Hilos", "Cierres", "Botones", "Broches", "Elásticos", "Cintas", "Etiquetas", "Entretelas", "Telas", "Chalecos", "Ambos médicos"];
      const pc = R.embudo.con_humano / R.embudo.maduros;
      return `<div class="muestrario"><span class="muestrario__t">Importa telas e insumos de confección. Pronto suma prendas y calzado.</span>${productos.map((x) => `<span class="muestra">${x}</span>`).join("")}</div>
      <div class="recorrido" style="margin-top:28px">
        <div class="estacion" style="min-height:150px"><h4>Anuncio en Meta</h4><p>Se abre WhatsApp con un mensaje precargado.</p></div>
        <div class="estacion" style="min-height:150px"><h4>Bot con IA</h4><p>Responde con el catálogo. No ve fotos ni audios.</p></div>
        <div class="estacion clave" style="min-height:150px"><h4>¿Entra una persona?</h4><p>En el ${pct(pc)} de los chats.</p></div>
        <div class="estacion" style="min-height:150px"><h4>Atención personalizada</h4><p>Un vendedor asesora y acompaña.</p></div>
      </div>
      <div class="grid" style="grid-template-columns:1.7fr 1fr;gap:30px;margin-top:30px;align-items:stretch">
        <div class="banda banda--hilo"><span class="banda__k">El problema</span><span class="banda__t">Hoy el gerente lee todos los chats para decidir cuáles atender primero.</span></div>
        ${tile(num(R.embudo.maduros), `conversaciones reales analizadas; ${num(R.embudo.con_humano)} terminaron con una persona.`, "tile--chico")}
      </div>`;
    },
  });

  slide({
    tag: "Hipótesis y resultado", quien: 0, min: 0.9, corto: "La respuesta primero",
    titulo: "Con lo que el bot ya respondió, Hitelac puede saber qué chats van a necesitar a una persona",
    notas: ["Conclusión primero, como pide la consigna.", "Leer los tres números y después las tres frases de abajo: qué resolvemos, para quién y qué cambia.", "Explicar 'acierto' en términos de negocio: el modelo ordena los chats por puntaje; si se atiende el 20 % de arriba, 94 de cada 100 terminan con una persona contra 50 al elegir al azar."],
    html: () => {
      const t = top20(), azar = Math.round(R.particiones.test.positivos * 100);
      const mejora = Math.round((Math.round(t.precision * 100) / azar - 1) * 100);
      const pm = Math.round(t.precision * 100);
      const barra = (valor, color, rotulo, sub) => `<div style="display:grid;grid-template-columns:330px 1fr;align-items:center;gap:20px;margin:14px 0">
            <div style="font-size:27px;line-height:1.15"><b>${rotulo}</b><br><span style="font-size:22px;color:var(--tinta-3)">${sub}</span></div>
            <div style="background:var(--mesa);border-radius:4px;height:64px"><div style="width:${valor}%;height:100%;background:${color};border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:16px;color:#fff;font:700 40px var(--display);font-variant-numeric:tabular-nums">${valor} de 100</div></div>
          </div>`;
      return `<div class="grid" style="grid-template-columns:1fr;gap:28px;margin-top:26px;align-items:stretch">
          <div class="tile tile--hilo" style="padding:20px 30px 16px">
            <div style="font-size:27px;color:var(--tinta-2)">De 100 chats, ¿cuántos terminan con una persona?</div>
            ${barra(pm, "#cf432c", "Con el modelo", "los 20 % de chats con mayor puntaje")}
            ${barra(azar, "#8a97a3", "Al azar", "20 % de chats elegidos sin criterio")}
            <div style="display:flex;align-items:baseline;gap:16px;margin-top:8px"><span class="tile__v" style="font-size:84px;color:var(--hilo)">+${mejora} %</span><span style="font-size:27px;color:var(--tinta-2)">de mejora sobre el azar</span></div>
          </div>
        </div>
        <div class="trio" style="margin-top:38px">
          <div><b>Qué resolvemos</b><span>Anticipar si un chat termina con una persona en las próximas 24 horas.</span></div>
          <div><b>Para quién</b><span>La gerencia comercial y técnica de Hitelac.</span></div>
          <div><b>Qué cambia</b><span>Se empieza por los chats que más probablemente la necesitan.</span></div>
        </div>
        <p class="chico" style="margin-top:24px">Probado con los chats de octubre de 2026, que el modelo no vio al entrenarse ni al ajustarse.</p>`;
    },
  });

  slide({
    tag: "Dominio y problema", quien: 0, min: 0.5, corto: "Valor para el negocio",
    titulo: "Revisar uno de cada cinco chats, en orden, cubre casi el doble que hacerlo al azar",
    notas: ["Traducir las métricas a plata y tiempo: menos lectura con el mismo foco.", "El límite principal: no hay datos de ventas, así que no sabemos si priorizar un chat termina en una venta. Lo que medimos es dónde interviene hoy el equipo.", "No prometemos ventas: no hay datos de venta en el caso."],
    html: () => {
      const t = top20(), azar = R.particiones.test.positivos;
      const mb = R.metricas[GRUPO].bosque;
      const conPersona = mb.tp + mb.fn, total = R.particiones.test.episodios;
      const vistosAzar = Math.round(t.chats_revisados * azar), vistosModelo = Math.round(t.chats_revisados * t.precision);
      const n = (v) => `<span class="cmp-n__v">${Math.round(v * 100)}</span><span class="cmp-n__u"> de 100</span>`;
      return `<div class="grid" style="gap:56px;margin-top:26px;grid-template-columns:1.3fr .7fr;align-items:start">
        <div class="hoja" style="padding:24px 30px"><div class="pregunta">Si el gerente revisa solo el 20 % de los chats (${num(t.chats_revisados)} de ${num(total)})…</div>
          <div style="font-size:26px;color:var(--tinta-2);margin:6px 0 4px">…¿cuántos de los ${num(conPersona)} chats que terminan con una persona llega a ver?</div>
          ${[["Al azar", vistosAzar, "#8a97a3"], ["Con el modelo", vistosModelo, "#1d5c4e"]].map(([r, v, c]) => `<div style="margin:16px 0 0"><div style="font-size:26px;font-weight:700;margin-bottom:4px">${r}</div>
            <div style="background:var(--mesa);border-radius:4px;height:76px;position:relative"><div style="width:${(v / conPersona * 100).toFixed(1)}%;height:100%;background:${c};border-radius:4px;display:flex;align-items:center;padding-left:16px;color:#fff;white-space:nowrap;overflow:hidden"><b style="font:700 34px/1 var(--display);font-variant-numeric:tabular-nums">${num(v)}</b><span style="font-size:22px;margin-left:8px">chats</span></div><span style="position:absolute;right:18px;top:0;height:100%;display:flex;align-items:center;font:700 38px var(--display);color:var(--tinta-2)">${Math.round(v / conPersona * 100)} %</span></div></div>`).join("")}
          <div style="display:flex;align-items:baseline;gap:16px;margin-top:20px"><span class="tile__v" style="font-size:72px;color:var(--verde)">+${Math.round((vistosModelo / vistosAzar - 1) * 100)} %</span><span style="font-size:26px;color:var(--tinta-2)">más chats con persona vistos que al azar</span></div>
        </div>
        <div style="display:grid;gap:18px;align-content:start">
          <div class="nota nota--verde"><b>Qué cambia</b><span>La supervisión empieza por los chats con más probabilidad de persona, en vez de leer todo.</span></div>
          <div class="nota nota--azul"><b>Qué no cambia</b><span>El criterio del gerente: el puntaje es una prioridad sugerida.</span></div>
          <div class="nota nota--hilo nota--fuerte"><b>Límite</b><span>No hay datos de ventas: no sabemos si un chat priorizado termina en una venta.</span></div>
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Arquitectura de la solución", quien: 1, min: 0.6, corto: "Arquitectura",
    titulo: "El recorrido de los datos: de los chats de WhatsApp al puntaje de prioridad",
    notas: ["Recorrer el diagrama de izquierda a derecha, una frase por estación. Aclarar que las cuatro primeras son la preparación de los datos, hecha antes del modelado: la exportación de los chats se hizo una vez desde el sistema de la empresa (corte del 1/11) y el grupo trabaja con esa copia. Lo que corre sin internet es el modelado y la aplicación (el simulador y los tableros), que no están conectados al sistema de chats de Hitelac.", "La fuente privada y la clave de seudonimización nunca salen del equipo dueño; el grupo trabaja con la copia revisada."],
    html: () => `
      <div class="fases"><span class="fase fase--previa">Preparación de los datos, hecha antes del modelado</span><span class="fase fase--modelo">Modelado y aplicación: corren sin internet</span></div>
      <div class="recorrido seis">
        <div class="estacion"><h4>Fuente privada</h4><p>Chats de WhatsApp y del bot, exportados de la empresa.</p></div>
        <div class="estacion"><h4>Limpieza</h4><p>Sin pruebas, contactos internos ni menús del bot. Seudonimizado.</p></div>
        <div class="estacion"><h4>Data Mart</h4><p>Base SQLite con mensajes, sesiones y episodios.</p></div>
        <div class="estacion"><h4>Variables</h4><p>56 señales al momento en que responde el bot. Nada del futuro.</p></div>
        <div class="estacion"><h4>Modelos</h4><p>Dummy, árbol, bosque y MLP, con el mismo corte temporal.</p></div>
        <div class="estacion clave"><h4>Aplicación</h4><p>Simulador y tableros de BI. Sin vínculo con el sistema de Hitelac.</p></div>
      </div>`,
  });

  slide({
    tag: "Feature engineering", quien: 1, min: 0.8, corto: "Del chat a las variables", chico: true,
    titulo: "El ancla convierte un chat en variables, sin mirar lo que pasa después",
    notas: ["Este chat es completamente ficticio. El cliente escribe presio con s, pero broches está explícito: el ejemplo muestra una consulta natural sin exponer mensajes reales.", "A las 10:02 llega la primera respuesta comercial del bot. Ese mensaje es el ancla: se congelan pedido, oferta, coincidencia, día y tiempo transcurrido. La respuesta humana posterior no puede entrar como variable porque es lo que queremos predecir.", "requested_* y offered_* son indicadores 0/1 por familia. Como pueden aparecer varias familias, es codificación multi-hot; matched_* cruza pedido y oferta. weekday transforma la fecha y requested_family_count cuenta las familias pedidas.", "Prefix es el tramo desde el primer mensaje de la sesión hasta el ancla: aquí son 120 segundos. El ejemplo supone un martes, por eso weekday vale 1 si lunes es 0."],
    html: () => `<div class="ancla-demo">
      <div class="wa-telefono">
        <div class="wa-cabecera"><div class="wa-avatar">H</div><div><b>Hitelac</b><small>Hila · asistente virtual</small></div><span class="wa-menu">⋮</span></div>
        <div class="wa-conversacion">
          <div class="wa-dia">MARTES · CHAT FICTICIO</div>
          <div class="wa-burbuja wa-saliente">¡Hola! ¿Tenés broches para ropa? Necesito saber el presio por mayor.<small>10:00 ✓✓</small></div>
          <div class="wa-burbuja wa-entrante"><b>¡Hola! Soy Hila, tu asistente virtual 👋</b><p>✓ Sí, tenemos broches para ropa.</p><p>Para ayudarte con modelos y precios, contame qué tipo y cantidad necesitás.</p><small>10:02</small></div>
          <div class="wa-ancla">ANCLA · primera respuesta comercial del bot</div>
        </div>
      </div>
      <div class="variables-ancla">
        <div class="pregunta">Variables fijadas a las 10:02</div>
        <p class="variables-ancla__sub">Solo usamos lo que el chat mostró hasta la respuesta comercial del bot.</p>
        <div class="variables-ancla__grid">
          <div class="variable-ancla"><code>requested_broches</code><b>1</b><span>El cliente pidió broches</span></div>
          <div class="variable-ancla"><code>offered_broches</code><b>1</b><span>El bot ofreció broches</span></div>
          <div class="variable-ancla"><code>matched_broches</code><b>1</b><span>Pedido y oferta coinciden</span></div>
          <div class="variable-ancla"><code>weekday</code><b>1</b><span>Martes, si lunes = 0</span></div>
          <div class="variable-ancla"><code>prefix_duration_seconds</code><b>120</b><span>Del primer mensaje al ancla</span></div>
          <div class="variable-ancla"><code>requested_family_count</code><b>1</b><span>Una familia de producto pedida</span></div>
        </div>
      </div>
    </div>
    <div class="ancla-aclaracion">La respuesta de una persona en las 24 horas siguientes será la etiqueta del episodio; no es una variable de entrada.</div>`,
  });

  slide({
    tag: "Arquitectura de la solución", quien: 1, min: 0.5, corto: "Los datos", chico: true,
    titulo: `De 47 mil mensajes a ${num(R.embudo.con_cobertura)} episodios con seguimiento comparable`,
    notas: ["Mensajes, sesiones y episodios son unidades distintas: de la exportación salen 35 mil mensajes elegibles, que se agrupan en 4.570 sesiones de consulta. Una pausa de más de 24 horas entre mensajes abre otra sesión; la sesión no tiene duración fija. Hay como máximo un episodio por sesión.", "De las 4.570 sesiones, 3.982 tienen un ancla comercial elegible. De esos episodios, 3.981 completaron el seguimiento de 24 horas; uno quedó pendiente al corte de los datos.", "El modelado actualizado excluye además 170 episodios maduros cuya ventana no tuvo horas de atención humana observada. Quedan 3.811 para comparar; ausencia de respuesta cuando no había atención no significa que el bot resolviera el caso.", "Recorrer las cuatro tarjetas: limpiar mensajes, agruparlos en una sesión, ubicar el ancla y observar las 24 horas siguientes. Las variables solo miran lo disponible hasta el ancla."],
    html: () => {
      const e = R.embudo;
      const fila = (v, texto, pctv, color) => `<div style="background:var(--mesa);border-radius:4px;height:56px;margin:8px 0"><div style="width:${Math.max(pctv, 0)}%;height:100%;background:${color};border-radius:4px;display:flex;align-items:center;gap:12px;padding-left:16px;color:#fff;white-space:nowrap;overflow:hidden"><b style="font:700 34px var(--display);font-variant-numeric:tabular-nums">${num(v)}</b><span style="font-size:22px">${texto}</span></div></div>`;
      return `<div class="grid" style="grid-template-columns:1fr 1fr;gap:48px;margin-top:20px">
        <div><div class="pregunta">Mensajes</div>
          ${fila(e.mensajes_fuente, "en la exportación", 100, "#8a94a0")}
          ${fila(e.mensajes, "elegibles tras la limpieza", (e.mensajes / e.mensajes_fuente) * 100, "#2f5da8")}</div>
        <div><div class="pregunta">De sesiones a episodios</div>
          ${fila(e.sesiones, "sesiones de consulta", 100, "#8a94a0")}
          ${fila(e.episodios, "con ancla comercial elegible", (e.episodios / e.sesiones) * 100, "#2f5da8")}
          ${fila(e.maduros, "con 24 h observadas", (e.maduros / e.sesiones) * 100, "#2f5da8")}
          ${fila(e.con_cobertura, "con atención posible en esas 24 h", (e.con_cobertura / e.sesiones) * 100, "#1d5c4e")}</div>
      </div>
      <div class="partido" style="height:54px;font-size:25px;margin-top:14px"><div style="width:${(e.con_humano / e.con_cobertura) * 100}%;background:#cf432c">${num(e.con_humano)} con respuesta humana</div><div style="flex:1;background:#1d5c4e">${num(e.sin_humano)} sin respuesta humana</div></div>
      <div class="pregunta" style="margin-top:18px">Cómo construimos cada episodio</div>
      <div class="recorrido episodio">
        <div class="estacion"><small>1 · LIMPIAR</small><h4>Mensajes elegibles</h4><p>Quitamos pruebas, contactos internos y menús del bot.</p></div>
        <div class="estacion"><small>2 · AGRUPAR</small><h4>Sesión de consulta</h4><p>Una pausa mayor a 24 h entre mensajes abre otra sesión.</p></div>
        <div class="estacion clave"><small>3 · ANCLA</small><h4>Primera respuesta comercial del bot</h4><p>En este instante fijamos las variables del episodio.</p></div>
        <div class="estacion"><small>4 · OBSERVAR</small><h4>24 horas siguientes</h4><p>Registramos si respondió una persona.</p></div>
      </div>`;
    },
  });

  slide({
    tag: "Análisis exploratorio", quien: 2, min: 0.7, corto: "Qué pide el cliente", chico: true,
    titulo: "Según qué producto pide el cliente, la intervención humana va del 15 % al 99 %",
    notas: ["Este es el hallazgo comercial más fuerte: el producto pedido marca el destino del chat.", "Broches son la mayoría de los pedidos y casi siempre los resuelve el bot; ambos médicos y chalecos son los productos que la empresa impulsa con anuncios y atiende con personas.", "Las filas con asterisco tienen pocos chats: no sacar conclusiones de ellas."],
    html: () => `<div class="grid" style="grid-template-columns:1.55fr .75fr;gap:46px;align-items:start;margin-top:12px">
        <div><div class="pregunta" style="margin-bottom:2px">De los chats que piden cada familia, ¿cuántos terminan con una persona?</div>${graficoFamilias()}</div>
        <div style="display:grid;gap:20px;padding-top:30px">
          ${tile(pct(R.familias.find((f) => f.id === "broches").tasa), `de los chats que piden broches (${num(R.familias.find((f) => f.id === "broches").episodios)}): el bot los resuelve casi solo.`, "tile--verde tile--chico")}
          ${tile(Math.round(R.familias.find((f) => f.id === "ambos").tasa * 100) + "–" + Math.round(R.familias.find((f) => f.id === "chalecos").tasa * 100) + " %", "de los que piden ambos médicos o chalecos terminan con una persona.", "tile--hilo tile--chico")}
          <div class="nota nota--azul"><b>Es una política</b><span>Hitelac impulsa esos productos con anuncios y los atiende con personas.</span></div>
        </div></div>`,
  });

  slide({
    tag: "Análisis exploratorio", quien: 2, min: 0.6, corto: "Los anuncios y los meses", chico: true,
    titulo: "Desde julio hay anuncios: el volumen se multiplicó por más de veinte y cambió qué se consulta",
    notas: ["Hasta junio no hay ni un chat de anuncio: unos 50 por mes, casi todos terminan con una persona.", "Desde julio aparecen los anuncios y en agosto el volumen se dispara. Casi todo el entrenamiento es de agosto.", "Dentro de agosto a octubre cambia qué producto se promociona (ambos médicos contra broches) y con eso cambia la proporción de chats con una persona.", "Consecuencia: hay que reentrenar cuando cambian las campañas."],
    html: () => {
      const c = Object.fromEntries(R.composicion.map((x) => [x.mes, x]));
      const train = R.composicion.reduce((a, x) => a + x.train, 0);
      const por = Object.fromEntries(R.meses.map((m) => [m.mes, m.chats]));
      return `<div class="grid" style="grid-template-columns:1.6fr .8fr;gap:46px;align-items:start;margin-top:14px">
        <div><div class="pregunta" style="margin-bottom:2px">Chats por mes</div>${graficoMeses()}</div>
        <div style="display:grid;gap:22px;padding-top:26px">
          ${tile("×" + Math.round(por["2026-08"] / por["2026-06"]), `de junio a agosto: de ${num(por["2026-06"])} a ${num(por["2026-08"])} chats.`, "tile--naranja")}
          ${tile(`${num(c["2026-08"].train)}<small>de ${num(train)}</small>`, "chats de entrenamiento son de agosto.", "tile--chico tile--naranja")}
          <div class="nota nota--hilo"><b>Hay que reentrenar</b><span>cuando cambian las campañas.</span></div>
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 1.0, corto: "Cuatro modelos", chico: true,
    titulo: "Cuatro modelos, un mismo corte temporal y una sola vara para compararlos",
    notas: ["Los cuatro son supervisados: aprenden de chats que ya tienen la respuesta conocida.", "El corte es por fecha, sin mezclar: entrenamos con lo anterior a septiembre, ajustamos en septiembre y probamos en octubre.", "La métrica principal es Average Precision: qué tan arriba pone los chats que sí terminan con una persona.", "Mismos chats, mismas variables y misma semilla para los cuatro. La purga descarta chats cuyo resultado cruza una fecha de corte (139 en total)."],
    html: () => {
      const ico = {
        dummy: `<svg viewBox="0 0 120 64" width="120" height="64"><line x1="8" y1="32" x2="112" y2="32" stroke="#8a94a0" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="32" r="9" fill="#8a94a0"/></svg>`,
        arbol: `<svg viewBox="0 0 120 64" width="120" height="64"><g stroke="#2f5da8" stroke-width="4" fill="none" stroke-linecap="round"><path d="M60 10 L28 34 M60 10 L92 34 M28 34 L12 56 M28 34 L44 56 M92 34 L76 56 M92 34 L108 56"/></g><g fill="#2f5da8"><circle cx="60" cy="10" r="8"/><circle cx="28" cy="34" r="7"/><circle cx="92" cy="34" r="7"/></g><g fill="#1d5c4e"><circle cx="12" cy="56" r="5"/><circle cx="44" cy="56" r="5"/></g><g fill="#cf432c"><circle cx="76" cy="56" r="5"/><circle cx="108" cy="56" r="5"/></g></svg>`,
        bosque: `<svg viewBox="0 0 120 64" width="120" height="64"><g fill="#b0457b"><path d="M20 10 L36 44 L4 44Z"/><path d="M60 4 L80 50 L40 50Z" opacity=".85"/><path d="M100 12 L116 46 L84 46Z"/></g><g stroke="#6b3a52" stroke-width="5" stroke-linecap="round"><path d="M20 44 V58 M60 50 V62 M100 46 V58"/></g></svg>`,
        mlp: `<svg viewBox="0 0 120 64" width="120" height="64"><g stroke="#d9822b" stroke-width="2" opacity=".6"><path d="M16 14 L60 10 M16 14 L60 32 M16 14 L60 54 M16 32 L60 10 M16 32 L60 32 M16 32 L60 54 M16 50 L60 10 M16 50 L60 32 M16 50 L60 54 M60 10 L104 22 M60 32 L104 22 M60 54 L104 22 M60 10 L104 42 M60 32 L104 42 M60 54 L104 42"/></g><g fill="#d9822b"><circle cx="16" cy="14" r="6"/><circle cx="16" cy="32" r="6"/><circle cx="16" cy="50" r="6"/><circle cx="60" cy="10" r="6"/><circle cx="60" cy="32" r="6"/><circle cx="60" cy="54" r="6"/><circle cx="104" cy="22" r="6"/><circle cx="104" cy="42" r="6"/></g></svg>`,
      };
      const modelos = [
        ["dummy", "Dummy", "Siempre responde la proporción que vio. Es el piso de comparación.", "Es el piso", "#8a94a0"],
        ["arbol", "Árbol de decisión", "Cadena de preguntas de sí o no, como «¿pidió chalecos?».", "Se puede leer", "#1d5c4e"],
        ["bosque", "Bosque aleatorio", "Trescientos árboles que votan. Más estable que uno solo.", "No se puede leer", "#cf432c"],
        ["mlp", "Red neuronal (MLP)", "Capas de neuronas que combinan las variables.", "No se puede leer", "#cf432c"],
      ];
      return `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:30px;margin-top:40px;align-items:stretch">
          ${modelos.map(([id, n, t, lee, col]) => `<div class="modelo ${id}" style="padding:22px 24px 24px"><div style="height:64px;display:flex;align-items:center">${ico[id]}</div><div class="nombre" style="font-size:32px;margin-top:16px">${n}</div><p style="font-size:24px;line-height:1.3;margin-top:10px;margin-bottom:18px;color:#46535f;min-height:96px">${t}</p><span class="ficha" style="background:${col === "#cf432c" ? "var(--hilo-claro)" : col === "#1d5c4e" ? "var(--verde-claro)" : "#e1e5e8"};color:${col === "#cf432c" ? "#9a2f1e" : col === "#1d5c4e" ? "var(--verde)" : "var(--tinta-2)"};font-size:21px">${lee}</span></div>`).join("")}
        </div>
        <div class="hoja" style="margin-top:44px;padding:20px 30px 14px"><div class="pregunta">Los cuatro usan el mismo reparto de chats por fecha</div>${lineaDeTiempo()}</div>`;
    },
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 0.6, corto: "Qué variables usa cada grupo", chico: true,
    titulo: "Qué variables usa cada grupo, y qué pasa cuando sacamos el atajo",
    notas: ["Primero los tres tipos de variables: operativas (cómo fluye el chat), comerciales (qué pidió el cliente y qué ofreció el bot) y largo de texto.", "El protocolo del grupo fija 58 variables: las tres juntas. Sin las dos de largo de texto quedan 56.", "Leer el gráfico de izquierda a derecha: con el largo del mensaje, las operativas parecen rendir bien; sin él, quedan al nivel del azar; las comerciales sostienen todo.", "El largo de texto delata qué anuncio usó el cliente y se rompe si cambian el texto del anuncio: por eso lo sacamos."],
    html: () => {
      const tipo = (color, titulo, detalle, cant) => `<div style="display:grid;grid-template-columns:116px 1fr;background:var(--papel);border-radius:6px 6px 6px 20px;overflow:hidden;box-shadow:0 1px 0 rgba(24,34,45,.12)"><div style="background:${color};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0"><span style="font:700 60px/1 var(--display);font-variant-numeric:tabular-nums">${cant}</span><span style="font-size:19px;font-weight:600;opacity:.9">variables</span></div><div style="padding:16px 22px 18px"><div style="font:650 32px/1.05 var(--display);color:#18222d">${titulo}</div><div style="font-size:23px;line-height:1.3;margin-top:6px;color:#46535f">${detalle}</div></div></div>`;
      return `<div class="grid cuerpo" style="grid-template-columns:.8fr 1.2fr;gap:48px;align-items:start;margin-top:22px">
        <div style="display:grid;gap:18px">
          ${tipo("#8a94a0", "Operativas", "Cómo fluye el chat: hora, día, cantidad de mensajes y demora del bot.", 9)}
          ${tipo("#1d5c4e", "Comerciales", "Qué pidió el cliente y qué le ofreció el bot, producto por producto.", 47)}
          ${tipo("#cf432c", "Largo de texto", "Cuántos caracteres tiene el mensaje. Delata qué anuncio usó el cliente: lo sacamos.", 2)}
          <div class="nota nota--azul"><span><b style="display:inline;font-size:26px">9 + 47 + 2 = 58</b> variables del protocolo. Sin el largo de texto: <b style="display:inline;font-size:26px">56</b>.</span></div>
        </div>
        <div class="hoja" style="padding:18px 26px 8px"><div class="pregunta" style="margin-bottom:2px">Calidad del ranking en octubre (más alto es mejor)</div>${graficoAblacion()}</div>
      </div>`;
    },
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 0.8, corto: "Resultados y elección", chico: true,
    titulo: "Los tres rinden parecido; el bosque puntúa mejor y el árbol explica por qué",
    notas: ["Mirar las barras: con las 56 variables, árbol 0,87, bosque 0,89 y MLP 0,87. En ranking son parecidos y las líneas finas muestran el margen de error.", "Elegimos el bosque para puntuar: ordena más fino (el árbol da solo 16 valores distintos y casi un quinto de los chats empata), tiene el mejor error de calibración (0,155) y el mejor F1 (0,80).", "El árbol queda al lado para explicar: son 16 reglas de producto que la gerencia puede discutir. Es una aproximación, no es el bosque mismo.", "Por qué no el MLP: en ranking no hay diferencia clara con el bosque (el intervalo de la diferencia incluye el cero), no mejora en calibración ni en F1, y además no se puede explicar. Por qué el árbol y no el bosque para explicar: el árbol se puede leer regla por regla. Combinar modelos y justificar qué aporta cada uno es parte de lo que pide la consigna."],
    html: () => {
      const c = DATOS.complejidad, g = DATOS.modelos.granularidad;
      const fila3 = (k, d, mayor) => {
        const v = ["arbol", "bosque", "mlp"].map((m) => R.metricas[GRUPO][m][k]);
        const mejor = mayor ? Math.max(...v) : Math.min(...v);
        return v.map((x) => `<td${x === mejor ? ' style="color:var(--verde);font-weight:700"' : ""}>${dec(x, d)}</td>`).join("");
      };
      return `<div class="grid" style="grid-template-columns:1fr 1fr;gap:64px;align-items:start;margin-top:20px">
        <div class="hoja" style="padding:22px 28px 12px"><div class="pregunta" style="margin-bottom:6px">Calidad del ranking en octubre (más alto es mejor)</div>${graficoModelos()}</div>
        <div>
          <div class="pregunta" style="margin-bottom:14px">Cada modelo, con su papel</div>
          <table class="tabla" style="font-size:25px"><thead><tr><th></th><th>Árbol</th><th>Bosque</th><th>MLP</th></tr></thead><tbody>
            <tr><td>Ranking (AP)</td>${fila3("ap", 2, true)}</tr>
            <tr><td>ROC-AUC</td>${fila3("roc", 2, true)}</tr>
            <tr><td>Error de calibración</td>${fila3("brier", 3, false)}</tr>
            <tr><td>F1</td>${fila3("f1", 2, true)}</tr>
            <tr><td>Su papel</td><td style="font-weight:700;color:var(--azul)">Explica</td><td style="font-weight:700;color:#b0457b">Puntúa</td><td style="font-weight:700;color:#b8681a">Alternativa</td></tr>
            <tr><td>¿Se puede leer?</td><td style="color:var(--verde);font-weight:700">Sí, ${c.arbol.hojas} reglas</td><td style="color:#9a2f1e">No</td><td style="color:#9a2f1e">No</td></tr>
          </tbody></table>
          <div style="margin-top:22px;background:var(--verde);color:#fff;border-radius:6px 6px 6px 22px;padding:16px 26px 18px"><div style="font:700 36px/1 var(--display)">Elegimos el bosque</div>
            <div style="display:flex;gap:12px;margin-top:12px">${[["1.º", "en AP y ROC-AUC"], [num(g.bosque.distintos), `puntajes distintos (árbol: ${g.arbol.distintos})`], ["≈", "ventaja chica: dentro del margen de error"]].map(([k, t]) => `<div style="flex:1;background:rgba(255,255,255,.16);border-radius:4px;padding:8px 14px"><div style="font:700 34px/1 var(--display)">${k}</div><div style="font-size:20px;line-height:1.15;margin-top:4px">${t}</div></div>`).join("")}</div></div>
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 1.0, corto: "Matrices de confusión", chico: true,
    titulo: "Qué aciertan y en qué se equivocan los cuatro modelos en octubre",
    notas: ["Mostrar la tabla completa y destacar el bosque, sin ocultar a los demás.", "La accuracy no decide sola: el Dummy saca casi 0,50 sin saber nada. La métrica principal es Average Precision y se muestra precision, recall y F1 porque son fáciles de defender.", "Matrices: una falsa alarma es un chat que el modelo prioriza y no terminó con una persona; un falso negativo es uno con persona que quedó con menos prioridad. Importan por el uso de la cola, no por ventas.", "Con el corte de 50 los modelos marcan de más porque la proporción de chats con persona bajó de 62 % a 49 % entre septiembre y octubre."],
    html: () => {
      const celda = (v, max, acierto, rotulo) => {
        const a = 0.18 + 0.72 * (v / max);
        const fondo = acierto ? `rgba(29,92,78,${a})` : `rgba(207,67,44,${a})`;
        return `<div style="background:${fondo};color:${a > 0.5 ? "#fff" : "#18222d"};border-radius:6px;padding:8px 6px 7px;text-align:center"><div style="font:700 46px/1 var(--display);font-variant-numeric:tabular-nums">${num(v)}</div><div style="font-size:18px;margin-top:2px;opacity:.92">${rotulo}</div></div>`;
      };
      const matriz = (id) => {
        const r = R.metricas[GRUPO][id], max = Math.max(r.tn, r.fp, r.fn, r.tp);
        const suave = "font-size:18px;color:var(--tinta-2);line-height:1.1";
        return `<div class="hoja" style="padding:10px 22px 14px;border-top:8px solid ${id === "dummy" ? "#8a94a0" : COL[id]}">
          <div style="font:700 30px/1 var(--display);margin-bottom:6px;color:${id === "dummy" ? "#46535f" : COL[id]}">${NOMBRE[id]}</div>
          <div style="display:grid;grid-template-columns:30px 100px 1fr 1fr;gap:8px">
            <div style="${suave};grid-area:1 / 3 / 2 / 5;text-align:center;font-weight:700">El modelo dice</div>
            <div style="${suave};grid-area:2 / 3;text-align:center">sin persona</div><div style="${suave};grid-area:2 / 4;text-align:center">con persona</div>
            <div style="${suave};grid-area:3 / 1 / 5 / 2;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-weight:700">En realidad</div>
            <div style="${suave};grid-area:3 / 2;align-self:center">sin persona</div><div style="grid-area:3 / 3">${celda(r.tn, max, true, "acierta")}</div><div style="grid-area:3 / 4">${celda(r.fp, max, false, "falsa alarma")}</div>
            <div style="${suave};grid-area:4 / 2;align-self:center">con persona</div><div style="grid-area:4 / 3">${celda(r.fn, max, false, "se le escapó")}</div><div style="grid-area:4 / 4">${celda(r.tp, max, true, "acierta")}</div>
          </div></div>`;
      };
      return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 34px;margin-top:10px">${["dummy", "arbol", "bosque", "mlp"].map(matriz).join("")}</div>`;
    },
  });

  slide({
    tag: "Conclusión", quien: 4, min: 0.8, corto: "El ranking funciona", chico: true,
    titulo: "El ranking funciona: a mayor puntaje, más chats terminan con una persona",
    notas: ["Ordenamos los chats de octubre del puntaje más alto al más bajo y los partimos en cinco grupos iguales (unos 206 chats cada uno).", "En el grupo de puntajes más altos, 94 de cada 100 terminan con una persona; en el de puntajes más bajos, 5 de cada 100. Y los primeros grupos también reciben más mensajes de una persona.", "Esto describe conducta histórica del equipo, no necesidad. El orden es consistente con la atención real: la correlación entre puntaje y mensajes humanos es 0,63 (Spearman)."],
    html: () => {
      const filas = R.tramos[GRUPO + "/bosque"].filas;
      const conPersona = filas.map((f) => f.tasa_respuesta * f.episodios);
      const total = conPersona.reduce((a, v) => a + v, 0);
      const dosPrimeros = Math.round(((conPersona[0] + conPersona[1]) / total) * 100);
      const parte = Math.round(((filas[0].episodios + filas[1].episodios) / filas.reduce((a, f) => a + f.episodios, 0)) * 100);
      return `<div class="grid cuerpo" style="grid-template-columns:1.3fr .7fr;gap:48px;align-items:start;margin-top:16px">
        <div class="hoja" style="padding:18px 26px 8px"><div class="pregunta" style="margin-bottom:2px">Los ${num(filas.reduce((a, f) => a + f.episodios, 0))} chats de octubre, ordenados por puntaje y cortados en cinco tramos iguales</div><div style="font-size:23px;color:var(--tinta-2);margin-bottom:4px">En cada tramo: ¿qué porcentaje terminó con una persona?</div>${graficoGrupos()}</div>
        <div style="display:grid;gap:22px;padding-top:6px">
          ${tile(`${Math.round(filas[0].tasa_respuesta * 100)} → ${Math.round(filas[filas.length - 1].tasa_respuesta * 100)} %`, "terminan con persona: del tramo de mayor puntaje al de menor.", "tile--hilo tile--chico")}
          ${tile(`${dosPrimeros} %`, `de todos los chats con persona están en el ${parte} % de arriba de la cola.`, "tile--verde tile--chico")}
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Conclusión", quien: 4, min: 0.8, corto: "Más allá de los productos impulsados", chico: true,
    titulo: "Gran parte del resultado es reconocer los productos que la empresa deriva a personas",
    notas: ["Ambos médicos y chalecos son los productos que la empresa impulsa con anuncios y refuerza con atención humana: el 44 % de los chats de octubre, y el 95 % termina con una persona.", "El modelo separa muy bien esos chats del resto, y de ahí viene buena parte del 0,89. Dentro de ese grupo no distingue (ROC-AUC 0,39, incluso peor que el azar).", "En el resto de los chats, el modelo aporta una mejora moderada: entre 1,5 y 2,7 veces mejor que el azar. Solo hay 84 chats con persona en ese grupo, así que el margen de error es grande.", "Decirlo de frente antes de que lo pregunten."],
    html: () => {
      const s = R.segmentos.bosque, total = s.todos.chats, t = R.top_k_resto;
      const filas = t.map((f) => `<tr><td>${Math.round(f.fraccion * 100)} % (${num(f.chats_revisados)} chats)</td><td>${pct(f.precision)}</td><td>${dec(f.mejora_sobre_azar, 1).replace(",0", "")} veces</td></tr>`).join("");
      return `<div class="grid cuerpo" style="grid-template-columns:1fr 1fr;gap:48px;align-items:start;margin-top:20px">
        <div style="display:grid;gap:22px">
          <div class="hoja" style="border-top:8px solid #cf432c;padding:22px 32px"><div class="pregunta" style="color:#cf432c">Ambos médicos o chalecos</div>
            <div style="display:flex;gap:30px;align-items:baseline;margin-top:6px"><div class="cifra med hilo" style="font-size:84px">${pct(s.impulsados.prevalencia)}</div><div class="texto" style="font-size:26px">de ${num(s.impulsados.chats)} chats (${pct(s.impulsados.chats / total)}) terminan con una persona</div></div>
            <p class="chico" style="margin-top:6px">Dentro de este grupo el modelo no distingue: ROC-AUC ${dec(s.impulsados.roc_auc, 2)} (0,5 es azar).</p></div>
          <div class="hoja" style="border-top:8px solid #1d5c4e;padding:22px 32px"><div class="pregunta">Todo lo demás</div>
            <div style="display:flex;gap:30px;align-items:baseline;margin-top:6px"><div class="cifra med verde" style="font-size:84px">${pct(s.resto.prevalencia)}</div><div class="texto" style="font-size:26px">de ${num(s.resto.chats)} chats (${pct(s.resto.chats / total)}) terminan con una persona</div></div>
            <p class="chico" style="margin-top:6px">Acá el modelo aporta: Average Precision ${dec(s.resto.average_precision, 2)} contra ${dec(s.resto.prevalencia, 2)} del azar, ROC-AUC ${dec(s.resto.roc_auc, 2)}.</p></div>
        </div>
        <div>
          <div class="pregunta" style="margin-bottom:8px">Si se revisan solo los primeros del "resto"</div>
          <table class="tabla" style="font-size:24px"><thead><tr><th>Se revisa</th><th>Con persona</th><th>Contra el azar</th></tr></thead><tbody>${filas}</tbody></table>
          <p class="chico" style="margin-top:12px">Solo hay ${num(s.resto.con_humano)} chats con persona en este grupo: los porcentajes tienen mucho margen de error.</p>
          <div class="cosido" style="margin-top:18px;padding:18px 26px"><span class="texto" style="font-size:25px">El modelo reconoce con claridad los productos que se derivan a personas y, en el resto, mejora moderadamente la prioridad.</span></div>
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Aplicación funcional", quien: 5, min: 0.7, corto: "Del puntaje a la prioridad", chico: true,
    titulo: "Del puntaje a la prioridad: la cola de chats se divide en cuatro niveles",
    notas: ["Cada chat recibe un puntaje del bosque; su lugar en la cola de chats pendientes define el nivel: Alta (los primeros 30 %), Media (30 a 50 %), Baja (50 a 70 %) y Base (el resto).", "Las cifras son por nivel y no acumuladas: en octubre terminan con una persona 93, 69, 31 y 5 de cada 100 chats. En septiembre la separación fue parecida.", "Los cortes son una propuesta para validar con la gerencia y se definen por posición en la cola y no por probabilidad, porque los puntajes no están calibrados.", "El modelo ordena la cola: no decide por el operador. El prototipo es offline; la integración con el sistema de chats de Hitelac queda como trabajo aparte."],
    html: () => {
      const nv = Object.fromEntries(R.niveles.test.map((f) => [f.nivel, f]));
      const sv = Object.fromEntries(R.niveles.validation.map((f) => [f.nivel, f]));
      const orden = ["Alta", "Media", "Baja", "Base"];
      const color = { Alta: "#cf432c", Media: "#d9822b", Baja: "#f2c230", Base: "#1d5c4e" };
      const sub = { Alta: "los primeros 30 % de la cola", Media: "del 30 al 50 %", Baja: "del 50 al 70 %", Base: "el 30 % restante" };
      const columnas = orden.map((n) => `<div>
          <div style="background:${color[n]};color:${n === "Baja" ? "#18222d" : "#fff"};padding:12px 18px;border-radius:6px 6px 0 0"><div style="font:700 34px var(--display)">${n}</div><div style="font-size:21px">${sub[n]}</div></div>
          <div class="hoja" style="border-radius:0 0 6px 20px;padding:16px 14px 18px;text-align:center"><div class="cifra med" style="font-size:76px">${Math.round(nv[n].tasa * 100)}<span style="font-size:26px;font-weight:500"> de 100</span></div><div class="chico" style="font-size:22px">terminan con una persona</div></div>
        </div>`).join("");
      const mitad = Math.round((nv.Alta.parte_de_los_con_persona + nv.Media.parte_de_los_con_persona) * 100);
      return `<p class="texto" style="margin-top:20px;font-size:28px">Cada chat recibe un puntaje y, según su lugar en la cola, un nivel de prioridad. Cifras de octubre:</p>
        <div style="display:grid;grid-template-columns:3fr 2fr 2fr 3fr;gap:14px;margin-top:20px">${columnas}</div>
        <p class="texto fuerte" style="margin-top:22px;font-size:29px">Alta y Media son la mitad de los chats y reúnen a ${mitad} de cada 100 que terminan con una persona.</p>
        <div class="cosido" style="margin-top:16px;padding:16px 28px"><span class="texto" style="font-size:24px">Propuesta para validar con la gerencia. Los cortes (30, 50 y 70 %) se definen por el lugar en la cola y no por probabilidad, porque los puntajes no están calibrados. En septiembre la separación fue parecida: ${orden.map((n) => Math.round(sv[n].tasa * 100)).join(", ")} de cada 100.</span></div>`;
    },
  });

  slide({
    clase: "app", tag: "Aplicación funcional", quien: 5, min: 1.3, corto: "Probalo", chico: true,
    titulo: "Probalo: armá un chat y mirá qué responden los modelos",
    notas: ["Elegir un ejemplo, mostrar el resultado y cambiar una sola cosa. Aclarar que el número es un puntaje de prioridad (0 a 100), no una probabilidad calibrada.", "La prioridad sugerida ubica el puntaje del bosque entre los chats de octubre: un puntaje alto puede salir Media si muchos chats (los de ambos médicos y chalecos) puntúan todavía más alto.", "Esto corre en el navegador, sin servidor: los modelos entrenados están dentro de la página."],
    html: () => `<div class="sim">
        <div>
          <div class="bloque-sim"><h5><i class="paso">1</i>Elegí un ejemplo</h5><div class="ejemplos" id="s-ejemplos">${EJEMPLOS.map((e, i) => `<button type="button" data-i="${i}">${esc(e.nombre)}</button>`).join("")}</div></div>
          <div class="bloque-sim"><h5><i class="paso">2</i>Qué pide el cliente</h5><div class="chips" id="s-pide">${FAM_SIM.map(([id, n]) => `<button type="button" class="chip pidio" data-id="${id}" aria-pressed="false">${esc(n)}</button>`).join("")}</div></div>
          <div class="bloque-sim"><h5><i class="paso paso--azul">3</i>Qué le ofrece el bot</h5><div class="chips" id="s-ofrece">${FAM_SIM.map(([id, n]) => `<button type="button" class="chip ofrecio" data-id="${id}" aria-pressed="false">${esc(n)}</button>`).join("")}</div></div>
          <div class="bloque-sim" style="margin-bottom:0"><h5><i class="paso paso--tinta">4</i>Cómo fue el chat</h5></div><div class="campos">
            <div class="campo"><label for="s-dia">Día</label><select id="s-dia">${DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select></div>
            <div class="campo"><label for="s-hora">Hora</label><select id="s-hora">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("")}</select></div>
            <div class="campo"><label for="s-texto">Mensajes del cliente</label><input id="s-texto" type="number" min="0" max="6" step="1"></div>
            <div class="campo"><label for="s-bot">Mensajes del bot</label><input id="s-bot" type="number" min="1" max="5" step="1"></div>
            <div class="campo campo--ancho"><label for="s-media">Fotos o audios del cliente</label><input id="s-media" type="number" min="0" max="3" step="1"></div>
            <div class="campo campo--ancho"><label for="s-seg">Segundos hasta que responde el bot</label><input id="s-seg" type="number" min="0" max="3600" step="5"></div>
          </div>
        </div>
        <div>
          <div class="resultado" id="s-tarjetas"></div>
        </div>
      </div>`,
    alEntrar: () => renderSim(),
  });

  slide({
    tag: "Aplicación funcional", quien: 5, min: 0.2, corto: "El árbol que explica", chico: true,
    titulo: `El árbol al lado: ${DATOS.complejidad.arbol.hojas} reglas que explican qué mira el bosque`,
    notas: ["Opcional si falta tiempo. Se puede abrir cualquier rama.", "Resaltado en amarillo: el camino que recorre el chat que armaste en la aplicación.", "Es lo que habilita una conversación con la gerencia: las reglas se pueden discutir y corregir. Aclarar que es una aproximación explicable, con calidad parecida al bosque pero no idéntico."],
    html: () => `<div class="grid" style="grid-template-columns:1.45fr .55fr;gap:44px;margin-top:20px">
        <div class="arbol-vista" id="s-arbol"></div>
        <div style="display:grid;gap:20px;align-content:start">
          <div class="nota nota--verde"><b>Cómo leerlo</b><span>Cada pregunta divide los chats en dos. Rojo: casi siempre con persona. Verde: casi nunca.</span></div>
          <div class="nota nota--azul"><b>Qué es</b><span>Rinde parecido al bosque (${dec(ap(GRUPO, "arbol"), 2)} contra ${dec(ap(GRUPO, "bosque"), 2)}) pero sirve para entender, no para puntuar.</span></div>
        </div></div>`,
    alEntrar: () => renderArbol(),
  });

  slide({
    tag: "Conclusión", quien: 4, min: 1.0, corto: "Conclusión", chico: true,
    titulo: "Conclusión: sí se puede ordenar la atención, con límites que conocemos",
    notas: ["Volver a la hipótesis y responderla en una frase.", "Decir los límites antes de que los pregunten: conducta histórica, un mes de prueba, derivaciones por producto, sin datos de ventas.", "Cerrar con los próximos pasos y abrir preguntas."],
    html: () => {
      const t = top20();
      return `<div class="grid" style="grid-template-columns:1.15fr 1fr 1fr;gap:26px;margin-top:22px;align-items:start">
        <div class="col col--verde"><div class="col__h">Lo que probamos</div>
          <div class="col__i"><b>${dec(ap(GRUPO, "bosque"))} contra ${dec(ap("operativas_sin_largo", "bosque"))}</b><span>qué pide el cliente y qué ofrece el bot predicen dónde interviene una persona</span></div>
          <div class="col__i"><b>${Math.round(t.precision * 100)} de 100</b><span>terminan con persona entre el 20 % de mayor puntaje; ahí están ${Math.round(t.cobertura * 100)} de cada 100 de todos los que la necesitan</span></div>
          <div class="col__i"><b>Bosque y árbol</b><span>el bosque puntúa; un árbol de ${DATOS.complejidad.arbol.hojas} hojas explica</span></div></div>
        <div class="col col--hilo"><div class="col__h">Lo que no afirmamos</div>
          <div class="col__l">Que esos chats necesitaran a una persona</div>
          <div class="col__l">Que ayude mucho con ambos y chalecos</div>
          <div class="col__l">Efecto sobre las ventas</div>
          <div class="col__l">Que lo no detectado no interese</div>
          <div class="col__l">Estabilidad: un solo mes de prueba y campañas que cambian</div></div>
        <div class="col col--azul"><div class="col__h">Próximos pasos</div>
          <div class="col__l">Validar una muestra con el gerente</div>
          <div class="col__l">Confirmar con Hitelac las derivaciones por producto</div>
          <div class="col__l">Recalibrar y fijar los niveles con el equipo</div>
          <div class="col__l">Piloto con una etiqueta de venta</div></div>
      </div>
      <div class="banda banda--verde" style="margin-top:26px"><span class="banda__t" style="font-size:34px">Con lo que el bot ya respondió, se puede ordenar la atención humana mucho mejor que al azar.</span></div>`;
    },
  });

  slide({
    clase: "equipo", tag: "Equipo y preguntas", quien: null, min: 0.3, corto: "Equipo y preguntas",
    titulo: "Quién presentó qué, y dónde está cada parte de la consigna",
    notas: ["Cada integrante presentó su área. Completar los nombres restantes antes de la defensa (se guardan en este navegador).", "Abrir preguntas."],
    chico: true,
    html: () => {
      const cubre = [["Dominio y problema", "cómo viaja un chat y valor para el negocio"], ["Arquitectura de la solución", "limpieza, variables y ancla de cada episodio"], ["Análisis exploratorio", "productos consultados, anuncios y cambios por mes"], ["Técnica de minería", "cuatro modelos: el bosque puntúa y el árbol explica"], ["Conclusión", "visualización, hipótesis respondida y límites"], ["Aplicación funcional", "esta misma página: los modelos corren acá"]];
      return `<div class="grid cuerpo" style="grid-template-columns:1.1fr .9fr;gap:70px;margin-top:30px">
        <div>${EQUIPO.map((e, i) => `<div class="rol-fila"><span class="disp" style="font-family:var(--display);font-variation-settings:'wdth' 82,'wght' 700;color:var(--tinta-3)">${i + 1}</span><span class="rol">${esc(e.rol)}</span><span class="fuerte" contenteditable="true" spellcheck="false" data-edit="${i}" role="textbox" aria-label="Nombre de ${esc(e.rol)}">${esc(e.nombre)}</span></div>`).join("")}</div>
        <div class="cosido"><div class="pregunta">Los seis entregables de la consigna</div><ul class="puntos chico" style="margin-top:14px">${cubre.map(([a, b]) => `<li><b>${a}:</b> ${b}.</li>`).join("")}</ul></div>
      </div>`;
    },
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Largo del texto", chico: true,
    titulo: "Anexo: por qué sacamos el largo del mensaje del modelo",
    notas: ["El largo del primer mensaje del cliente predecía muy bien, pero se concentra en pocos valores exactos: es la firma del mensaje precargado de cada anuncio.", "Eso cambia con cualquier retoque, hasta un signo de exclamación, y el modelo se rompería. Lo sacamos y medimos qué queda.", "Sin el largo de texto, las variables operativas solas quedan al nivel del azar; las comerciales sostienen todo."],
    html: () => `<div class="grid" style="grid-template-columns:1.5fr .7fr;gap:46px;align-items:start;margin-top:22px">
        <div>
          <div class="pregunta" style="margin-bottom:12px">Los tres largos más frecuentes del primer mensaje del cliente</div>
          ${R.largo_texto.map((f) => `<div class="regla"><div class="regla__a"><b>${f.caracteres}</b>caracteres</div><span class="regla__f">→</span><div class="regla__b">piden ${esc(f.familia.toLowerCase())}<small>${pct(f.parte_familia)} de esos chats</small></div><span class="regla__f">→</span><div class="regla__c ${f.tasa > 0.6 ? "hilo" : f.tasa < 0.35 ? "verde" : ""}">${pct(f.tasa)} con persona</div></div>`).join("")}
          <div class="nota nota--hilo" style="margin-top:18px"><span>Si cambian el texto del anuncio, aunque sea con un signo de exclamación, el valor cambia y un modelo que depende de eso se rompe sin avisar.</span></div>
        </div>
        <div style="display:grid;gap:20px">
          ${tile(dec(ap("operativas", "bosque")), "Ranking con las variables operativas y el largo del mensaje.", "tile--chico")}
          ${tile(dec(ap("operativas_sin_largo", "bosque")), `Las mismas variables sin el largo: ya no mejoran al azar (${dec(R.metricas.operativas.dummy.ap)}). Ese poder era la firma del anuncio.`, "tile--chico tile--hilo")}
          <div class="nota nota--verde"><b>El modelo final no lo usa</b><span>Se apoya en lo que pidió y ofreció el bot, y llega a ${dec(ap("completo_sin_largo", "bosque"))}.</span></div>
        </div>
      </div>`,
  });


  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Métricas completas", chico: true,
    titulo: "Anexo: métricas completas de los cuatro modelos",
    notas: ["Material de respaldo para preguntas."],
    html: () => {
      const f = (m) => R.metricas[GRUPO][m];
      const fila = (m) => `<tr${m === "bosque" ? ' class="mejor"' : ""}><td>${NOMBRE[m]}</td><td>${dec(f(m).ap, 3)} (${dec(f(m).ic_bajo, 3)}–${dec(f(m).ic_alto, 3)})</td><td>${dec(f(m).roc, 3)}</td><td>${dec(f(m).precision, 3)}</td><td>${dec(f(m).recall, 3)}</td><td>${dec(f(m).f1, 3)}</td><td>${dec(f(m).brier, 3)}</td></tr>`;
      return `<div class="cuerpo" style="margin-top:34px"><table class="tabla"><thead><tr><th>56 variables, octubre</th><th>Average Precision (IC 95 %)</th><th>ROC-AUC</th><th>Precision</th><th>Recall</th><th>F1</th><th>Brier</th></tr></thead><tbody>${["dummy", "arbol", "bosque", "mlp"].map(fila).join("")}</tbody></table>
      <p class="chico" style="margin-top:18px">Precision, recall y F1 con umbral 0,5. Intervalos que remuestrean contactos completos (1.000 repeticiones). El Dummy marca todo como "con persona", por eso recall 1 y precision igual a la proporción.</p></div>`;
    },
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Controles", chico: true,
    titulo: "Anexo: cómo evitamos las trampas del modelado",
    notas: ["Respaldo: preguntas sobre fugas de información y validez."],
    html: () => `<div class="grid g2 cuerpo" style="gap:70px;margin-top:30px">
        <ul class="puntos"><li>Las variables usan solo mensajes anteriores a la respuesta del bot, más esa respuesta.</li><li>Corte por fecha, sin mezclar meses. Se descartan ${num(R.particiones.purgado.episodios)} chats que cruzan una frontera.</li><li>Hiperparámetros elegidos solo con septiembre. Octubre no se usó para elegir nada.</li><li>Hashes de las bases verificados contra su manifiesto antes de cada corrida.</li></ul>
        <ul class="puntos hilo"><li>Octubre ya había sido inspeccionado en trabajo previo: es una prueba retrospectiva, no virgen.</li><li>No hay historial de ediciones de los textos: no se puede certificar ausencia total de fugas.</li><li>Los datos son seudonimizados, no anónimos.</li><li>El largo del texto se excluyó por ser un atajo frágil (ver análisis exploratorio).</li></ul>
      </div>`,
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Variables del protocolo", chico: true,
    titulo: "Anexo: qué pasa con las 58 variables del protocolo",
    notas: ["Respaldo: el protocolo del equipo fija 58 variables. Las 56 son un análisis adicional."],
    html: () => {
      const g = (gr, m) => dec(ap(gr, m), 3);
      const tabla = [["10 operativas", "operativas"], ["9 operativas, sin largo de texto", "operativas_sin_largo"], ["58 variables (protocolo)", "completo"], ["56 variables, sin largo de texto", "completo_sin_largo"]];
      return `<div class="grid g2 cuerpo" style="gap:50px;margin-top:30px;align-items:start">
        <div><table class="tabla"><thead><tr><th>Average Precision, octubre</th><th>Árbol</th><th>Bosque</th><th>MLP</th></tr></thead><tbody>${tabla.map(([n, k]) => `<tr${k === GRUPO ? ' class="mejor"' : ""}><td>${n}</td><td>${g(k, "arbol")}</td><td>${g(k, "bosque")}</td><td>${g(k, "mlp")}</td></tr>`).join("")}</tbody></table></div>
        <div><div class="pregunta" style="margin-bottom:6px">Qué bloque de variables pesa más (bosque, 56 variables)</div>${graficoBloques()}</div></div>`;
    },
  });

  /* ---------- armado ---------- */
  const cont = document.getElementById("slides");
  const MINUTOS_TOTAL = 15;
  let actual = 0;

  SLIDES.forEach((s, i) => {
    const el = document.createElement("section");
    el.className = "slide" + (s.clase ? " " + s.clase : "");
    el.dataset.i = i;
    el.style.setProperty("--acento", ACENTOS[s.tag] || "#1d5c4e");
    el.innerHTML = etiquetaHTML(s.tag, s.quien) + (s.titulo ? `<h2 class="titulo${s.chico ? " medio" : ""}">${esc(s.titulo)}</h2>` : "") + s.html();
    cont.appendChild(el);
  });
  const nodos = Array.from(document.querySelectorAll(".slide"));
  let acumulado = 0;
  const inicios = SLIDES.map((s) => { const v = acumulado; if (!s.anexo) acumulado += s.min; return v; });
  const totalPlan = acumulado;

  function ir(n) {
    n = Math.max(0, Math.min(SLIDES.length - 1, n));
    actual = n;
    nodos.forEach((el, i) => el.classList.toggle("activa", i === n));
    if (SLIDES[n].alEntrar) SLIDES[n].alEntrar();
    pintarPasos();
    renderNotas();
    document.getElementById("flecha-ant").disabled = n === 0;
    document.getElementById("flecha-sig").disabled = n === SLIDES.length - 1;
    try { history.replaceState(null, "", "#" + (n + 1)); } catch (e) { /* ignorar */ }
  }

  /* ---------- cinta métrica ---------- */
  const cinta = document.getElementById("cinta");
  const X0 = 96, POR_MIN = 114;
  const xDe = (min) => X0 + min * POR_MIN;
  let tiempo = { corriendo: false, seg: 0, ultimo: 0 };
  function armarCinta() {
    let s = `<svg viewBox="0 0 1920 104" preserveAspectRatio="none">`;
    for (let q = 0; q <= MINUTOS_TOTAL * 4; q++) {
      const x = xDe(q / 4), alto = q % 4 === 0 ? 38 : q % 2 === 0 ? 26 : 16;
      s += `<line class="tick" x1="${x}" x2="${x}" y1="3" y2="${3 + alto}"/>`;
      if (q % 4 === 0) s += `<text class="num" x="${x}" y="${3 + 38 + 30}" text-anchor="middle">${q / 4}</text>`;
    }
    SLIDES.forEach((sl, i) => {
      if (sl.anexo) return;
      const x = xDe(inicios[i] * (MINUTOS_TOTAL / totalPlan));
      s += `<g class="paso" data-i="${i}" tabindex="0" role="button" aria-label="Ir a ${esc(sl.corto)}"><title>${esc(sl.corto)}</title><rect x="${x - 15}" y="68" width="30" height="36" fill="transparent"/><polygon points="${x - 11},104 ${x + 11},104 ${x},82"/></g>`;
    });
    s += `<g class="clip" id="clip" transform="translate(${xDe(0)},0)"><line x1="0" x2="0" y1="-16" y2="104"/><rect x="-46" y="-52" width="92" height="38" rx="4"/><text x="0" y="-24" text-anchor="middle" id="clip-t">0:00</text></g></svg>`;
    cinta.innerHTML = s;
    cinta.querySelectorAll(".paso").forEach((g) => {
      g.addEventListener("click", () => ir(Number(g.dataset.i)));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(Number(g.dataset.i)); } });
    });
  }
  function pintarPasos() {
    cinta.querySelectorAll(".paso").forEach((g) => g.classList.toggle("actual", Number(g.dataset.i) === actual));
  }
  function pintarClip() {
    const min = tiempo.seg / 60;
    const x = xDe(Math.min(min, MINUTOS_TOTAL + 0.4));
    document.getElementById("clip").setAttribute("transform", `translate(${x},0)`);
    const m = Math.floor(tiempo.seg / 60), s = Math.floor(tiempo.seg % 60);
    document.getElementById("clip-t").textContent = m + ":" + String(s).padStart(2, "0");
    cinta.classList.toggle("pasado", min > MINUTOS_TOTAL);
  }
  setInterval(() => {
    if (!tiempo.corriendo) return;
    const ahora = performance.now();
    tiempo.seg += (ahora - tiempo.ultimo) / 1000;
    tiempo.ultimo = ahora;
    pintarClip();
  }, 250);
  function alternarTimer() {
    tiempo.corriendo = !tiempo.corriendo;
    tiempo.ultimo = performance.now();
    const b = document.getElementById("b-timer");
    b.textContent = tiempo.corriendo ? "Pausar cronómetro" : (tiempo.seg > 0 ? "Seguir cronómetro" : "Iniciar cronómetro");
    b.classList.toggle("on", tiempo.corriendo);
  }
  function reiniciarTimer() { tiempo = { corriendo: false, seg: 0, ultimo: 0 }; document.getElementById("b-timer").textContent = "Iniciar cronómetro"; document.getElementById("b-timer").classList.remove("on"); pintarClip(); }

  /* ---------- notas y vista general ---------- */
  const panelNotas = document.getElementById("notas");
  const vista = document.getElementById("vista");
  function renderNotas() {
    const s = SLIDES[actual];
    panelNotas.innerHTML = `<h3>${esc(s.corto)}</h3><div class="meta">${s.anexo ? "Anexo, sin tiempo asignado" : "Tiempo sugerido: " + (s.min * 60 >= 60 ? num(s.min, 1) + " min" : Math.round(s.min * 60) + " s")}${s.quien !== null && s.quien !== undefined ? " · Presenta " + esc(EQUIPO[s.quien].nombre) : ""}</div><ul>${s.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p style="margin-top:26px;color:#f2c230">Plan total: ${num(totalPlan, 1)} min de ${MINUTOS_TOTAL}.</p>`;
  }
  function renderVista() {
    const normales = SLIDES.map((s, i) => ({ s, i })).filter((x) => !x.s.anexo);
    const anexos = SLIDES.map((s, i) => ({ s, i })).filter((x) => x.s.anexo);
    const boton = ({ s, i }) => `<button type="button" data-i="${i}" class="${i === actual ? "actual" : ""}"><b>${esc(s.corto)}</b><span>${esc(s.tag)}${s.anexo ? "" : " · " + num(s.min, 1) + " min"}</span></button>`;
    vista.innerHTML = `<h3>Vista general</h3><div class="rejilla-v">${normales.map(boton).join("")}</div><div class="anexos">Anexos para preguntas</div><div class="rejilla-v">${anexos.map(boton).join("")}</div>`;
    vista.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { vista.hidden = true; ir(Number(b.dataset.i)); }));
  }
  const alternar = (el, id) => { el.hidden = !el.hidden; document.getElementById(id).classList.toggle("on", !el.hidden); };
  document.getElementById("b-timer").addEventListener("click", alternarTimer);
  document.getElementById("b-notas").addEventListener("click", () => alternar(panelNotas, "b-notas"));
  document.getElementById("b-vista").addEventListener("click", () => { renderVista(); alternar(vista, "b-vista"); });
  const pantalla = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  document.getElementById("b-pantalla").addEventListener("click", pantalla);

  /* ---------- simulador: eventos y render ---------- */
  let simListo = false;
  function enlazarSim() {
    if (simListo) return;
    simListo = true;
    const marcar = (cont, clave) => document.querySelectorAll(cont + " .chip").forEach((b) => {
      b.addEventListener("click", () => { const id = b.dataset.id; const c = sim[clave]; if (c.has(id)) c.delete(id); else c.add(id); renderSim(); });
    });
    marcar("#s-pide", "pide");
    marcar("#s-ofrece", "ofrece");
    document.querySelectorAll("#s-ejemplos button").forEach((b) => b.addEventListener("click", () => {
      const e = EJEMPLOS[Number(b.dataset.i)];
      sim.pide = new Set(e.pide); sim.ofrece = new Set(e.ofrece); sim.dia = 1; sim.hora = 15; sim.texto = 1; sim.media = 0; sim.bot = 1; sim.seg = 12;
      renderSim();
    }));
    const campo = (id, clave, min, max) => document.getElementById(id).addEventListener("input", (ev) => {
      const v = Number(ev.target.value);
      if (!Number.isFinite(v)) return;
      sim[clave] = Math.max(min, Math.min(max, Math.round(v)));
      renderSim();
    });
    campo("s-dia", "dia", 0, 6); campo("s-hora", "hora", 0, 23); campo("s-texto", "texto", 0, 6); campo("s-media", "media", 0, 3); campo("s-bot", "bot", 1, 5); campo("s-seg", "seg", 0, 3600);
  }
  function renderSim() {
    enlazarSim();
    document.querySelectorAll("#s-pide .chip").forEach((b) => { const on = sim.pide.has(b.dataset.id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("#s-ofrece .chip").forEach((b) => { const on = sim.ofrece.has(b.dataset.id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    set("s-dia", sim.dia); set("s-hora", sim.hora); set("s-texto", sim.texto); set("s-media", sim.media); set("s-bot", sim.bot); set("s-seg", sim.seg);
    const horario = document.getElementById("s-horario");
    if (horario) horario.textContent = enHorario(sim.dia, sim.hora) ? "Sí" : "No";
    const x = vectorDe(sim);
    const p = motor.predecirTodos(M, x);
    const nivelDe = (arriba) => (arriba <= 30 ? { clase: "alta", texto: "Alta" } : arriba <= 50 ? { clase: "media", texto: "Media" } : arriba <= 70 ? { clase: "baja", texto: "Baja" } : { clase: "base", texto: "Base" });
    const prioridad = nivelDe(motor.posicionEnRanking(M.cuantiles_test.bosque, p.bosque));
    const NIV = { alta: ["Alta", "#cf432c", "#fff"], media: ["Media", "#d9822b", "#fff"], baja: ["Baja", "#f2c230", "#18222d"], base: ["Base", "#1d5c4e", "#fff"] };
    const arriba = (id) => motor.posicionEnRanking(M.cuantiles_test[id], p[id]);
    const total = R.particiones.test.episodios;
    const aB = arriba("bosque"), sobreB = Math.max(0, 100 - aB);
    const [nomN, colN, txtN] = NIV[prioridad.clase];
    const zonas = [["alta", 30], ["media", 20], ["baja", 20], ["base", 30]];
    const tira = zonas.map(([k, w]) => `<div style="width:${w}%;background:${NIV[k][1]};color:${NIV[k][2]};opacity:${k === prioridad.clase ? 1 : .35}">${NIV[k][0]}</div>`).join("");
    const fila = (id, rol) => {
      const [n, c, t] = NIV[nivelDe(arriba(id)).clase];
      const chip = id === "dummy" ? `<span class="res-nota">No mira el chat</span>` : `<span class="res-chip" style="background:${c};color:${t}">${n}</span>`;
      return `<div class="res-fila"><div><b>${NOMBRE[id]}</b><span>${rol}</span></div><div class="res-num">${Math.round(p[id] * 100)}</div>${chip}</div>`;
    };
    document.getElementById("s-tarjetas").innerHTML = `
      <div class="res-tit">Resultado para este chat</div>
      <div class="res-hero">
        <div class="res-cab"><span class="res-niv" style="background:${colN};color:${txtN}">Prioridad ${nomN}</span><span class="res-punt">Puntaje del bosque <b>${Math.round(p.bosque * 100)}</b> de 100</span></div>
        <div class="res-cola"><div class="res-tira">${tira}</div><div class="res-marca" style="left:${Math.min(99, Math.max(1, aB))}%"><i></i></div></div>
        <div class="res-pie">Los ${num(total)} chats de octubre, del puntaje más alto (izquierda) al más bajo. Este chat supera al ${sobreB} % de ellos.</div>
      </div>
      <div class="res-otros"><div class="res-sub">Lo que dicen los otros modelos</div>${fila("arbol", "el que explica")}${fila("mlp", "red neuronal")}${fila("dummy", "piso de comparación")}</div>`;
  }
  function renderArbol() {
    const x = vectorDe(sim);
    document.getElementById("s-arbol").innerHTML = arbolHTML(motor.caminoArbol(M.arbol, x));
  }

  /* ---------- edición de nombres ---------- */
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.edit !== undefined) {
      const i = Number(t.dataset.edit);
      EQUIPO[i].nombre = t.textContent.trim() || "Integrante " + (i + 1);
      guardarEquipo();
      document.querySelectorAll('[data-quien="' + i + '"]').forEach((el) => { el.textContent = EQUIPO[i].nombre; });
    }
  });

  /* ---------- teclado y escala ---------- */
  document.getElementById("flecha-ant").addEventListener("click", () => ir(actual - 1));
  document.getElementById("flecha-sig").addEventListener("click", () => ir(actual + 1));
  document.addEventListener("keydown", (e) => {
    const t = e.target, k = e.key;
    const flecha = k === "ArrowRight" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowUp";
    const escribiendo = t && (t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(number|range|checkbox|radio|button)$/.test(t.type || "text")));
    if (escribiendo) return;
    if (t && /INPUT|SELECT/.test(t.tagName) && !flecha) return;
    if (flecha && t && t.blur) t.blur();
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") { e.preventDefault(); ir(actual + 1); }
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") { e.preventDefault(); ir(actual - 1); }
    else if (k === "Home") ir(0);
    else if (k === "End") ir(SLIDES.length - 1);
    else if (k === "t" || k === "T") alternarTimer();
    else if (k === "r" || k === "R") reiniciarTimer();
    else if (k === "n" || k === "N") alternar(panelNotas, "b-notas");
    else if (k === "g" || k === "G") { renderVista(); alternar(vista, "b-vista"); }
    else if (k === "f" || k === "F") pantalla();
    else if (k === "Escape") { panelNotas.hidden = true; vista.hidden = true; document.getElementById("b-notas").classList.remove("on"); document.getElementById("b-vista").classList.remove("on"); }
  });
  const escenario = document.getElementById("escenario");
  function escalar() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    escenario.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener("resize", escalar);
  escalar();

  armarCinta();
  pintarClip();
  const inicial = parseInt((location.hash || "").replace("#", ""), 10);
  ir(Number.isFinite(inicial) ? inicial - 1 : 0);
})();

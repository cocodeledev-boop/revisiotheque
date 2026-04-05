import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const SUBJECTS = [
  { label: "Mathématiques",  color: "#4F7FFF", bg: "#EEF3FF" },
  { label: "Français",        color: "#E05A2B", bg: "#FFF0EB" },
  { label: "Histoire-Géo",    color: "#2BAE66", bg: "#EBFAF2" },
  { label: "Physique-Chimie", color: "#9B3FCC", bg: "#F5EBFF" },
  { label: "SVT",             color: "#1EA8A1", bg: "#EBFAFA" },
  { label: "Anglais",         color: "#D4A017", bg: "#FFF9E6" },
  { label: "Philosophie",     color: "#C0392B", bg: "#FEECEB" },
  { label: "Économie",        color: "#2874A6", bg: "#EBF4FD" },
  { label: "Autre",           color: "#7F8C8D", bg: "#F2F3F3" },
];

const getSubject = (label) =>
  SUBJECTS.find((s) => s.label === label) || SUBJECTS[SUBJECTS.length - 1];

const randomAvatar = (name) => {
  const initials = (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const hue = [...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return { initials, hue };
};

const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = (height * MAX) / width; width = MAX; }
          else { width = (width * MAX) / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Injection du CSS pour le spinner
const styleTag = document.createElement("style");
styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);

export default function App() {
  const [fiches, setFiches]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [filterSubject, setFilter]      = useState("Toutes");
  const [search, setSearch]             = useState("");
  const [expandedId, setExpandedId]     = useState(null);
  const [saving, setSaving]             = useState(false);
  const [successMsg, setSuccessMsg]     = useState(false);
  const [errorMsg, setErrorMsg]         = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // id de la fiche à supprimer
  const fileInputRef = useRef();
  const [form, setForm] = useState({
    auteur: "", matiere: "Mathématiques", titre: "", contenu: "",
  });

  // ── Charger les fiches ───────────────────────────────────────────────────
  const loadFiches = async () => {
    try {
      const q = query(collection(db, "fiches"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setFiches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErrorMsg("Impossible de charger les fiches. Vérifie Firebase.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFiches(); }, []);

  // ── Image ────────────────────────────────────────────────────────────────
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErrorMsg("Image trop grande (max 5 Mo)."); return; }
    try {
      const base64 = await compressImage(file);
      setImageBase64(base64);
      setImagePreview(base64);
      setErrorMsg("");
    } catch { setErrorMsg("Impossible de lire l'image."); }
  };

  const removeImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Publier ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.auteur.trim() || !form.titre.trim() || !form.contenu.trim()) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const payload = { ...form, createdAt: serverTimestamp() };
      if (imageBase64) payload.image = imageBase64;
      const docRef = await addDoc(collection(db, "fiches"), payload);
      setFiches((prev) => [{ id: docRef.id, ...form, createdAt: { seconds: Date.now() / 1000 }, image: imageBase64 }, ...prev]);
      setForm({ auteur: form.auteur, matiere: form.matiere, titre: "", contenu: "" });
      removeImage();
      setShowForm(false);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    } catch (e) {
      console.error(e);
      setErrorMsg("Erreur de publication. Vérifie les règles Firebase (Firestore → Règles).");
    } finally {
      setSaving(false);
    }
  };

  // ── Supprimer ────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "fiches", id));
      setFiches((prev) => prev.filter((f) => f.id !== id));
      setConfirmDelete(null);
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      console.error(e);
      alert("Impossible de supprimer. Vérifie les règles Firebase.");
    }
  };

  const canSubmit = form.auteur.trim() && form.titre.trim() && form.contenu.trim() && !saving;

  const filtered = fiches.filter((f) => {
    const matchSubject = filterSubject === "Toutes" || f.matiere === filterSubject;
    const matchSearch  = search === "" ||
      (f.titre  || "").toLowerCase().includes(search.toLowerCase()) ||
      (f.contenu|| "").toLowerCase().includes(search.toLowerCase()) ||
      (f.auteur || "").toLowerCase().includes(search.toLowerCase());
    return matchSubject && matchSearch;
  });

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div style={s.root}>

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo}>
            <span style={{ fontSize: 36 }}>📚</span>
            <div>
              <div style={s.logoTitle}>RévisoThèque</div>
              <div style={s.logoSub}>Partagez vos fiches, apprenez ensemble</div>
            </div>
          </div>
          <button style={s.addBtn} onClick={() => { setShowForm(true); setErrorMsg(""); }}>
            <span style={{ fontSize: 18, marginRight: 8 }}>+</span> Déposer une fiche
          </button>
        </div>
      </header>

      {/* ── TOAST ── */}
      {successMsg && <div style={s.toast}>✅ Fiche publiée avec succès !</div>}

      {/* ── MODAL CONFIRMATION SUPPRESSION ── */}
      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...s.modal, maxWidth: 380, padding: "28px 28px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 17, textAlign: "center", marginBottom: 8 }}>Supprimer cette fiche ?</div>
            <div style={{ color: "#777", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Cette action est irréversible.</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={s.cancelBtn} onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button style={{ ...s.submitBtn, background: "#C0392B" }} onClick={() => handleDelete(confirmDelete)}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FORMULAIRE ── */}
      {showForm && (
        <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>✍️ Nouvelle fiche de révision</span>
              <button style={s.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>

            {errorMsg && <div style={s.errorBox}>{errorMsg}</div>}

            <label style={s.label}>Votre prénom / pseudo</label>
            <input style={s.input} placeholder="Ex: Emma, LeMatheux42…"
              value={form.auteur} onChange={(e) => setForm({ ...form, auteur: e.target.value })} />

            <label style={s.label}>Matière</label>
            <select style={s.input} value={form.matiere}
              onChange={(e) => setForm({ ...form, matiere: e.target.value })}>
              {SUBJECTS.map((sub) => <option key={sub.label}>{sub.label}</option>)}
            </select>

            <label style={s.label}>Titre de la fiche</label>
            <input style={s.input} placeholder="Ex: Les fonctions dérivées…"
              value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} />

            <label style={s.label}>Contenu de la fiche</label>
            <textarea style={{ ...s.input, minHeight: 140, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Cours, définitions, formules, exemples…"
              value={form.contenu} onChange={(e) => setForm({ ...form, contenu: e.target.value })} />

            {/* IMAGE */}
            <label style={s.label}>Image (optionnel)</label>
            {imagePreview ? (
              <div style={{ marginBottom: 18 }}>
                <img src={imagePreview} alt="preview" style={{ width: "100%", borderRadius: 8, maxHeight: 200, objectFit: "cover", display: "block" }} />
                <button style={{ ...s.cancelBtn, marginTop: 8, fontSize: 13 }} onClick={removeImage}>✕ Supprimer l'image</button>
              </div>
            ) : (
              <div style={s.imageUploadArea} onClick={() => fileInputRef.current.click()}>
                <span style={{ fontSize: 32 }}>🖼️</span>
                <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>Clique pour ajouter une image</span>
                <span style={{ fontSize: 11, color: "#AAA" }}>JPG, PNG — max 5 Mo</span>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*"
              style={{ display: "none" }} onChange={handleImageChange} />

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setShowForm(false)}>Annuler</button>
              <button style={{ ...s.submitBtn, opacity: canSubmit ? 1 : 0.5 }}
                onClick={handleSubmit} disabled={!canSubmit}>
                {saving
                  ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={s.spinner} />Publication…</span>
                  : "📤 Publier la fiche"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FILTRES ── */}
      <div style={s.filtersBar}>
        <div style={s.filtersInner}>
          <input style={s.searchInput} placeholder="🔍 Rechercher une fiche…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={s.chips}>
            {["Toutes", ...SUBJECTS.map((x) => x.label)].map((label) => {
              const sub = getSubject(label);
              const active = filterSubject === label;
              return (
                <button key={label} onClick={() => setFilter(label)}
                  style={{ ...s.chip, background: active ? (label === "Toutes" ? "#222" : sub.color) : "#F0F0F0",
                    color: active ? "#FFF" : "#555", fontWeight: active ? 700 : 400 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <main style={s.main}>
        {loading ? (
          <div style={s.empty}><div style={{ fontSize: 56 }}>⏳</div><div>Chargement des fiches…</div></div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 56 }}>📭</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
              {fiches.length === 0 ? "Aucune fiche pour l'instant" : "Aucun résultat"}
            </div>
            <div style={{ color: "#999", fontSize: 14 }}>
              {fiches.length === 0 ? "Sois le premier à déposer une fiche !" : "Essaie d'autres mots-clés."}
            </div>
            {fiches.length === 0 && (
              <button style={{ ...s.addBtn, marginTop: 20 }} onClick={() => setShowForm(true)}>
                + Déposer la première fiche
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={s.count}>{filtered.length} fiche{filtered.length > 1 ? "s" : ""} disponible{filtered.length > 1 ? "s" : ""}</div>
            <div style={s.grid}>
              {filtered.map((fiche) => {
                const sub      = getSubject(fiche.matiere);
                const av       = randomAvatar(fiche.auteur);
                const expanded = expandedId === fiche.id;
                const preview  = (fiche.contenu || "").slice(0, 200);
                return (
                  <div key={fiche.id} style={{ ...s.card, borderTop: `4px solid ${sub.color}` }}>

                    {/* En-tête carte */}
                    <div style={s.cardTop}>
                      <span style={{ ...s.badge, background: sub.bg, color: sub.color }}>{fiche.matiere}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={s.cardDate}>{formatDate(fiche.createdAt)}</span>
                        <button
                          style={s.deleteBtn}
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(fiche.id); }}
                          title="Supprimer cette fiche">
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Contenu cliquable */}
                    <div onClick={() => setExpandedId(expanded ? null : fiche.id)} style={{ cursor: "pointer" }}>
                      <div style={s.cardTitle}>{fiche.titre}</div>
                      {fiche.image && (
                        <img src={fiche.image} alt="illustration"
                          style={{ width: "100%", borderRadius: 8, maxHeight: expanded ? "none" : 160, objectFit: "cover", marginBottom: 8 }} />
                      )}
                      <div style={s.cardContent}>
                        {expanded ? fiche.contenu : preview}
                        {!expanded && (fiche.contenu || "").length > 200 && (
                          <span style={{ color: sub.color, fontWeight: 600 }}> … voir plus</span>
                        )}
                      </div>
                      {expanded && (fiche.contenu || "").length > 200 && (
                        <div style={{ color: sub.color, fontSize: 12, fontWeight: 700, textAlign: "center", marginTop: 4 }}>▲ Réduire</div>
                      )}
                    </div>

                    {/* Footer auteur */}
                    <div style={s.cardFooter}>
                      <div style={{ ...s.avatar, background: `hsl(${av.hue},65%,55%)` }}>{av.initials}</div>
                      <span style={s.authorName}>{fiche.auteur}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <footer style={s.footer}>
        📚 RévisoThèque — Les fiches sont partagées et conservées pour toujours · Firebase & Vercel
      </footer>
    </div>
  );
}

const s = {
  root:           { minHeight: "100vh", background: "#F7F6F2", fontFamily: "'Georgia', serif", color: "#1A1A1A" },
  header:         { background: "#1A1A1A", padding: "0 24px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.2)" },
  headerInner:    { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" },
  logo:           { display: "flex", alignItems: "center", gap: 14 },
  logoTitle:      { color: "#FFF", fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" },
  logoSub:        { color: "#AAA", fontSize: 12, marginTop: 1 },
  addBtn:         { background: "#F0C040", color: "#1A1A1A", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "Georgia, serif" },
  toast:          { position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", background: "#2BAE66", color: "#FFF", borderRadius: 10, padding: "12px 28px", fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", fontSize: 15 },
  overlay:        { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal:          { background: "#FFF", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" },
  modalHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  closeBtn:       { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#777" },
  errorBox:       { background: "#FEECEB", border: "1px solid #C0392B", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#C0392B", marginBottom: 16 },
  label:          { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#444", textTransform: "uppercase", letterSpacing: "0.5px" },
  input:          { width: "100%", border: "2px solid #E8E8E8", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 18, boxSizing: "border-box", background: "#FAFAFA", fontFamily: "Georgia, serif", color: "#1A1A1A" },
  imageUploadArea:{ border: "2px dashed #CCC", borderRadius: 8, padding: "28px 16px", marginBottom: 18, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#FAFAFA" },
  modalFooter:    { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 4 },
  cancelBtn:      { background: "#EEE", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 14 },
  submitBtn:      { background: "#1A1A1A", color: "#FFF", border: "none", borderRadius: 8, padding: "10px 22px", cursor: "pointer", fontWeight: 700, fontFamily: "Georgia, serif", fontSize: 14, display: "flex", alignItems: "center" },
  spinner:        { width: 14, height: 14, border: "2px solid #555", borderTop: "2px solid #FFF", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" },
  filtersBar:     { background: "#FFF", borderBottom: "1px solid #E8E8E8", padding: "16px 24px", position: "sticky", top: 72, zIndex: 90 },
  filtersInner:   { maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 },
  searchInput:    { width: "100%", border: "2px solid #E8E8E8", borderRadius: 8, padding: "10px 16px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Georgia, serif", background: "#F7F6F2" },
  chips:          { display: "flex", flexWrap: "wrap", gap: 8 },
  chip:           { border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontFamily: "Georgia, serif" },
  main:           { maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" },
  count:          { fontSize: 13, color: "#888", marginBottom: 20, fontStyle: "italic" },
  grid:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
  card:           { background: "#FFF", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 10 },
  cardTop:        { display: "flex", justifyContent: "space-between", alignItems: "center" },
  badge:          { borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" },
  cardDate:       { fontSize: 11, color: "#AAA", fontStyle: "italic" },
  deleteBtn:      { background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 4px", borderRadius: 4, opacity: 0.5 },
  cardTitle:      { fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  cardContent:    { fontSize: 13, color: "#555", lineHeight: 1.7, whiteSpace: "pre-wrap", flexGrow: 1 },
  cardFooter:     { display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #F0F0F0", paddingTop: 12, marginTop: 4 },
  avatar:         { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#FFF", flexShrink: 0 },
  authorName:     { fontSize: 13, fontWeight: 600, color: "#333" },
  empty:          { textAlign: "center", padding: "80px 20px", color: "#777", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  footer:         { textAlign: "center", padding: 20, color: "#BBB", fontSize: 12, borderTop: "1px solid #E8E8E8", background: "#FFF" },
};

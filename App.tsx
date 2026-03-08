import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  RotateCcw,
  FolderOpen,
  Plus,
  CheckCircle2,
  EyeOff,
  Eye,
  FolderPlus,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  Trash2,
} from "lucide-react";

const Card = ({ className = "", children }: any) => <div className={className}>{children}</div>;
const CardHeader = ({ className = "", children }: any) => <div className={className}>{children}</div>;
const CardTitle = ({ className = "", children }: any) => <h2 className={className}>{children}</h2>;
const CardDescription = ({ className = "", children }: any) => <p className={className}>{children}</p>;
const CardContent = ({ className = "", children }: any) => <div className={className}>{children}</div>;
const Button = ({ className = "", variant, size, children, ...props }: any) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variant === "outline" ? "bg-white text-slate-900" : "bg-slate-900 text-white"} ${size === "sm" ? "px-2 py-1 text-xs" : ""} ${className}`}
  >
    {children}
  </button>
);
const Input = ({ className = "", ...props }: any) => <input {...props} className={`w-full rounded-xl border px-3 py-2 text-sm ${className}`} />;
const Textarea = ({ className = "", ...props }: any) => <textarea {...props} className={`w-full rounded-xl border px-3 py-2 text-sm ${className}`} />;
const Badge = ({ className = "", children }: any) => <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${className}`}>{children}</span>;

const STORAGE_KEY = "ocr-media-revision-trainer-v7";
const SUPABASE_URL = typeof import.meta !== "undefined" ? import.meta.env.VITE_SUPABASE_URL : undefined;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;
const CLOUD_ENABLED = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
const supabase = CLOUD_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with", "by", "at", "from", "is", "are", "was", "were", "be", "been", "being", "it", "its", "that", "this", "these", "those", "as", "into", "than", "then", "their", "there", "them", "they", "he", "she", "his", "her", "you", "your", "i", "we", "our", "us",
]);

function normalizeWord(word: string) {
  return String(word || "").toLowerCase().replace(/[“”‘’]/g, "").replace(/[^a-z0-9]/gi, "");
}

function normalizeSentence(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”‘’]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return String(text || "").match(/\w+|[^\w\s]+|\s+/g) || [];
}

function chooseGapIndices(text: string, seed = 0) {
  const tokens = tokenize(text);
  const candidates: number[] = [];
  tokens.forEach((tok, i) => {
    const clean = normalizeWord(tok);
    if (/^[a-z0-9]+$/i.test(clean) && clean.length >= 4 && !STOPWORDS.has(clean)) candidates.push(i);
  });
  if (!candidates.length) return { tokens, gapIndices: [] as number[] };
  const maxGaps = Math.min(6, Math.max(2, Math.round(candidates.length * 0.3)));
  const rotated = [...candidates.slice(seed % candidates.length), ...candidates.slice(0, seed % candidates.length)];
  const selected: number[] = [];
  const step = Math.max(1, Math.floor(rotated.length / maxGaps) || 1);
  for (let i = 0; i < rotated.length && selected.length < maxGaps; i += step) selected.push(rotated[i]);
  if (!selected.length) selected.push(rotated[0]);
  return { tokens, gapIndices: selected };
}

function buildGapPrompt(text: string, seed = 0) {
  const { tokens, gapIndices } = chooseGapIndices(text, seed);
  const blanks: string[] = [];
  const prompt = tokens
    .map((tok, idx) => {
      if (gapIndices.includes(idx)) {
        blanks.push(tok);
        return "_".repeat(Math.max(4, tok.length));
      }
      return tok;
    })
    .join("");
  return { blanks, prompt };
}

function parseCards(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length === 1) return [raw];
  const grouped: string[] = [];
  let current = "";
  lines.forEach((line) => {
    const cleaned = line.replace(/^✔\s*/, "");
    if (/^[A-Z].*[-–—].*/.test(cleaned) && current) {
      grouped.push(current.trim());
      current = cleaned;
    } else {
      current += (current ? " " : "") + cleaned;
    }
  });
  if (current.trim()) grouped.push(current.trim());
  return grouped;
}

function compareWords(user: string, correct: string) {
  const userWords = normalizeSentence(user).split(/\s+/).filter(Boolean);
  const correctWords = normalizeSentence(correct).split(/\s+/).filter(Boolean);
  const max = Math.max(userWords.length, correctWords.length);
  const diffs: { user: string; correct: string; ok: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    const u = userWords[i] || "";
    const c = correctWords[i] || "";
    diffs.push({ user: u, correct: c, ok: u === c });
  }
  return diffs;
}

function createFolder(name = "New folder") {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, cards: [] as string[] };
}

function createDefaultState() {
  const folder = createFolder("General");
  return { folders: [folder], selectedFolderId: folder.id, meta: {} as any };
}

function sanitizeCloudState(data: any) {
  if (!data || typeof data !== "object") return createDefaultState();
  return {
    folders: Array.isArray(data.folders) ? data.folders : createDefaultState().folders,
    selectedFolderId: data.selectedFolderId || data.folders?.[0]?.id || createDefaultState().selectedFolderId,
    meta: data.meta && typeof data.meta === "object" ? data.meta : {},
  };
}

function Comparison({ diffs }: any) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-sm font-medium">Your answer</div>
        <div className="rounded-2xl border p-4 leading-7">
          {diffs.map((d: any, i: number) => (
            <span key={i} className={`mr-2 mb-2 inline-block rounded px-1.5 py-0.5 ${d.ok ? "bg-green-100" : "bg-red-100"}`}>
              {d.user || "∅"}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">Correct version</div>
        <div className="rounded-2xl border p-4 leading-7">
          {diffs.map((d: any, i: number) => (
            <span key={i} className={`mr-2 mb-2 inline-block rounded px-1.5 py-0.5 ${d.ok ? "bg-green-100" : "bg-amber-100"}`}>
              {d.correct || "∅"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OCRMediaRevisionTrainer() {
  const stored = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : createDefaultState();
    } catch {
      return createDefaultState();
    }
  }, []);

  const [folders, setFolders] = useState(stored.folders || createDefaultState().folders);
  const [selectedFolderId, setSelectedFolderId] = useState(stored.selectedFolderId || stored.folders?.[0]?.id);
  const [meta, setMeta] = useState(stored.meta || {});
  const [newFolderName, setNewFolderName] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [studyCardRealIndex, setStudyCardRealIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState("read");
  const [rewriteInput, setRewriteInput] = useState("");
  const [rewriteDiffs, setRewriteDiffs] = useState<any[]>([]);
  const [gapSeed, setGapSeed] = useState(0);
  const [gapAnswers, setGapAnswers] = useState<string[]>([]);
  const [gapResult, setGapResult] = useState<any[] | null>(null);
  const [showCardList, setShowCardList] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [editingCardText, setEditingCardText] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cloudUser, setCloudUser] = useState<any>(null);
  const [cloudStatus, setCloudStatus] = useState(CLOUD_ENABLED ? "Cloud ready" : "Cloud off");
  const [cloudLoaded, setCloudLoaded] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders, selectedFolderId, meta }));
  }, [folders, selectedFolderId, meta]);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setCloudStatus("Cloud auth error");
        return;
      }
      if (data?.user) {
        setCloudUser(data.user);
        setCloudStatus("Cloud signed in");
      } else {
        setCloudStatus("Cloud not signed in");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      setCloudUser(nextUser);
      setCloudStatus(nextUser ? "Cloud signed in" : "Cloud not signed in");
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !cloudUser || cloudLoaded) return;

    let cancelled = false;

    async function loadCloudState() {
      setCloudStatus("Loading cloud save...");
      const { data, error } = await supabase.from("revision_app_state").select("state").eq("user_id", cloudUser.id).maybeSingle();
      if (cancelled) return;
      if (error) {
        setCloudStatus("Cloud load failed");
        setCloudLoaded(true);
        return;
      }
      if (data?.state) {
        const next = sanitizeCloudState(data.state);
        setFolders(next.folders);
        setSelectedFolderId(next.selectedFolderId);
        setMeta(next.meta);
        setCloudStatus("Cloud loaded");
      } else {
        setCloudStatus("Cloud empty");
      }
      setCloudLoaded(true);
    }

    loadCloudState();
    return () => {
      cancelled = true;
    };
  }, [cloudUser, cloudLoaded]);

  useEffect(() => {
    if (!supabase || !cloudUser || !cloudLoaded) return;
    const timeout = setTimeout(async () => {
      const payload = { folders, selectedFolderId, meta };
      const { error } = await supabase
        .from("revision_app_state")
        .upsert({ user_id: cloudUser.id, state: payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      setCloudStatus(error ? "Cloud sync failed" : "Cloud synced");
    }, 700);
    return () => clearTimeout(timeout);
  }, [folders, selectedFolderId, meta, cloudUser, cloudLoaded]);

  const selectedFolder = folders.find((f: any) => f.id === selectedFolderId) || folders[0];
  const folderMeta = meta[selectedFolderId] || { mastered: {}, names: {} };
  const visibleCards = (selectedFolder?.cards || []).filter((_: any, i: number) => !folderMeta.mastered[i]);
  const currentCard = studyCardRealIndex !== null ? selectedFolder?.cards?.[studyCardRealIndex] || "" : visibleCards[cardIndex] || "";
  const gapData = useMemo(() => buildGapPrompt(currentCard, gapSeed), [currentCard, gapSeed]);

  async function signInToCloud() {
    if (!supabase || !authEmail.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) {
      setCloudStatus(error.message || "Email sign-in failed");
      return;
    }
    setCodeSent(true);
    setCloudStatus("Check email for code");
  }

  async function verifyCloudCode() {
    if (!supabase || !authEmail.trim() || !authCode.trim()) return;
    const { error } = await supabase.auth.verifyOtp({
      email: authEmail.trim(),
      token: authCode.trim(),
      type: "email",
    });
    setCloudStatus(error ? error.message || "Code verification failed" : "Cloud signed in");
    if (!error) {
      setAuthCode("");
      setCodeSent(false);
    }
  }

  async function signOutOfCloud() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudUser(null);
    setCloudLoaded(false);
    setCodeSent(false);
    setAuthCode("");
    setCloudStatus("Cloud signed out");
  }

  function resetStudy() {
    setCardIndex(0);
    setStudyCardRealIndex(null);
    setPhase("read");
    setRewriteInput("");
    setRewriteDiffs([]);
    setGapAnswers([]);
    setGapResult(null);
    setGapSeed(0);
  }

  function addFolder() {
    const folder = createFolder(newFolderName || `Folder ${folders.length + 1}`);
    setFolders((prev: any) => [...prev, folder]);
    setSelectedFolderId(folder.id);
    setNewFolderName("");
    resetStudy();
  }

  function addCards() {
    const parsed = parseCards(rawInput);
    if (!parsed.length) return;
    setFolders((prev: any) => prev.map((f: any) => (f.id === selectedFolderId ? { ...f, cards: [...f.cards, ...parsed] } : f)));
    setRawInput("");
    resetStudy();
  }

  function renameCard(realIndex: number, name: string) {
    setMeta((prev: any) => ({
      ...prev,
      [selectedFolderId]: {
        ...(prev[selectedFolderId] || { mastered: {}, names: {} }),
        names: { ...((prev[selectedFolderId] || {}).names || {}), [realIndex]: name },
      },
    }));
  }

  function startEditCard(realIndex: number) {
    setEditingCardIndex(realIndex);
    setEditingCardText(selectedFolder.cards[realIndex] || "");
  }

  function saveEditCard() {
    if (editingCardIndex === null) return;
    setFolders((prev: any) =>
      prev.map((folder: any) => {
        if (folder.id !== selectedFolderId) return folder;
        const nextCards = [...folder.cards];
        nextCards[editingCardIndex] = editingCardText.trim();
        return { ...folder, cards: nextCards };
      })
    );
    setEditingCardIndex(null);
    setEditingCardText("");
    resetStudy();
  }

  function cancelEditCard() {
    setEditingCardIndex(null);
    setEditingCardText("");
  }

  function toggleMastered(realIndex: number) {
    setMeta((prev: any) => ({
      ...prev,
      [selectedFolderId]: {
        ...(prev[selectedFolderId] || { mastered: {}, names: {} }),
        mastered: {
          ...((prev[selectedFolderId] || {}).mastered || {}),
          [realIndex]: !((prev[selectedFolderId] || {}).mastered || {})[realIndex],
        },
      },
    }));
    resetStudy();
  }

  function deleteCard(realIndex: number) {
    setFolders((prev: any) => prev.map((folder: any) => (folder.id === selectedFolderId ? { ...folder, cards: folder.cards.filter((_: any, i: number) => i !== realIndex) } : folder)));
    setMeta((prev: any) => {
      const topicMeta = prev[selectedFolderId] || { mastered: {}, names: {} };
      const nextMastered: any = {};
      const nextNames: any = {};
      Object.keys(topicMeta.mastered || {}).forEach((key) => {
        const i = Number(key);
        if (i < realIndex) nextMastered[i] = topicMeta.mastered[i];
        if (i > realIndex) nextMastered[i - 1] = topicMeta.mastered[i];
      });
      Object.keys(topicMeta.names || {}).forEach((key) => {
        const i = Number(key);
        if (i < realIndex) nextNames[i] = topicMeta.names[i];
        if (i > realIndex) nextNames[i - 1] = topicMeta.names[i];
      });
      return { ...prev, [selectedFolderId]: { ...topicMeta, mastered: nextMastered, names: nextNames } };
    });
    resetStudy();
  }

  function restartFolder() {
    setMeta((prev: any) => ({
      ...prev,
      [selectedFolderId]: {
        ...(prev[selectedFolderId] || { mastered: {}, names: {} }),
        mastered: {},
      },
    }));
    resetStudy();
  }

  function startGapTest() {
    setGapAnswers(Array(gapData.blanks.length).fill(""));
    setGapResult(null);
    setPhase("gaps");
  }

  function checkGaps() {
    const results = gapData.blanks.map((blank: string, i: number) => {
      const user = gapAnswers[i] || "";
      return { blank, user, correct: normalizeWord(user) === normalizeWord(blank) };
    });
    setGapResult(results);
    setPhase("gap-feedback");
  }

  function checkRewrite() {
    const diffs = compareWords(rewriteInput, currentCard);
    setRewriteDiffs(diffs);
    if (diffs.every((d: any) => d.ok)) {
      const realIndex = studyCardRealIndex !== null ? studyCardRealIndex : selectedFolder.cards.findIndex((card: string) => card === currentCard);
      toggleMastered(realIndex);
      setPhase("rewrite-success");
    } else {
      setPhase("rewrite-feedback");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="rounded-3xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl">OCR Media Revision Trainer</CardTitle>
            <CardDescription>Hidden answer mode, red and green corrections, folders, and optional cloud sync.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={restartFolder} className="rounded-2xl"><RotateCcw className="mr-2 h-4 w-4" />Restart folder</Button>
            <Button variant="outline" onClick={() => setShowCardList((v: boolean) => !v)} className="rounded-2xl">
              {showCardList ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showCardList ? "Hide card list" : "Show card list"}
            </Button>
            <Badge className="bg-green-100 text-green-800">Green = correct</Badge>
            <Badge className="bg-red-100 text-red-800">Red = wrong</Badge>
            <Badge className={`${cloudUser ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>
              {cloudUser ? <Cloud className="mr-1 h-3.5 w-3.5" /> : <CloudOff className="mr-1 h-3.5 w-3.5" />}
              {cloudStatus}
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="rounded-3xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" />Folders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CLOUD_ENABLED && (
                <div className="rounded-2xl border bg-slate-50 p-3 space-y-2">
                  <div className="text-sm font-medium">Cloud save</div>
                  <div className="text-xs text-slate-500">Sign in with email code.</div>
                  {!cloudUser ? (
                    <>
                      <Input value={authEmail} onChange={(e: any) => setAuthEmail(e.target.value)} placeholder="Email for cloud sync" />
                      {!codeSent ? (
                        <Button onClick={signInToCloud} className="w-full"><LogIn className="mr-2 h-4 w-4" />Send email code</Button>
                      ) : (
                        <>
                          <Input value={authCode} onChange={(e: any) => setAuthCode(e.target.value)} placeholder="Enter email code" />
                          <Button onClick={verifyCloudCode} className="w-full"><LogIn className="mr-2 h-4 w-4" />Verify code</Button>
                          <Button variant="outline" onClick={() => { setCodeSent(false); setAuthCode(""); }} className="w-full">Use different email</Button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-slate-600 break-all">Signed in as {cloudUser.email || "account"}</div>
                      <Button variant="outline" onClick={signOutOfCloud} className="w-full"><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
                    </>
                  )}
                </div>
              )}

              {folders.map((folder: any) => (
                <button key={folder.id} onClick={() => { setSelectedFolderId(folder.id); resetStudy(); }} className={`w-full rounded-xl border px-3 py-2 text-left ${folder.id === selectedFolderId ? "bg-slate-200 border-slate-800" : "bg-white"}`}>
                  <div className="font-medium">{folder.name}</div>
                  <div className="text-sm text-slate-500">{folder.cards.length} cards</div>
                </button>
              ))}

              <div className="flex gap-2 pt-2">
                <Input value={newFolderName} onChange={(e: any) => setNewFolderName(e.target.value)} placeholder="New folder" />
                <Button onClick={addFolder}><FolderPlus className="h-4 w-4" /></Button>
              </div>
              <Textarea value={rawInput} onChange={(e: any) => setRawInput(e.target.value)} placeholder="Paste flashcards into this folder" className="min-h-[160px]" />
              <Button onClick={addCards}><Plus className="mr-2 h-4 w-4" />Add cards</Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-lg">
            <CardHeader>
              <CardTitle>{selectedFolder?.name || "Folder"}</CardTitle>
              <CardDescription>{studyCardRealIndex !== null ? "Studying selected card only" : `${visibleCards.length} cards left to study`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {studyCardRealIndex !== null && <Button variant="outline" onClick={() => resetStudy()} className="rounded-2xl">Back to all cards</Button>}

              {showCardList && selectedFolder?.cards.map((card: string, i: number) => {
                const name = folderMeta.names[i] || `Card ${i + 1}`;
                const mastered = !!folderMeta.mastered[i];
                return (
                  <div key={i} className={`rounded-xl border p-3 ${mastered ? "bg-green-50" : "bg-white"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <Input value={name} onChange={(e: any) => renameCard(i, e.target.value)} className="max-w-[220px]" />
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" onClick={() => { setStudyCardRealIndex(i); setCardIndex(0); setPhase("read"); setRewriteInput(""); setGapAnswers([]); setGapResult(null); setGapSeed(0); }}>Study</Button>
                        <Button size="sm" variant="outline" onClick={() => startEditCard(i)}>Edit card</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleMastered(i)}><CheckCircle2 className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => deleteCard(i)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {editingCardIndex === i && (
                      <div className="mt-3 space-y-2">
                        <Textarea value={editingCardText} onChange={(e: any) => setEditingCardText(e.target.value)} className="min-h-[120px]" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEditCard}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEditCard}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!!currentCard && (
                <div className="rounded-2xl border bg-slate-50 p-6 space-y-4">
                  {phase === "read" && (
                    <>
                      <div className="text-sm text-slate-600">Answer first. The card text stays hidden until you submit.</div>
                      <Textarea value={rewriteInput} onChange={(e: any) => setRewriteInput(e.target.value)} placeholder="Write everything you remember about this card..." className="min-h-[160px]" />
                      <Button onClick={() => setPhase("reveal")}>Reveal mark scheme</Button>
                    </>
                  )}

                  {phase === "reveal" && (
                    <>
                      <Comparison diffs={compareWords(rewriteInput, currentCard)} />
                      <div className="rounded-xl border bg-white p-4 leading-7">{currentCard}</div>
                      <Button onClick={startGapTest}>Start gap test</Button>
                    </>
                  )}

                  {(phase === "gaps" || phase === "gap-feedback") && (
                    <>
                      <div className="rounded-xl border bg-white p-4 leading-7">{gapData.prompt}</div>
                      {gapData.blanks.map((_: string, i: number) => {
                        const result = gapResult?.[i];
                        const isCorrect = !!result?.correct;
                        const isWrong = !!result && !result.correct;
                        return (
                          <div key={i} className={`mt-2 rounded-xl border p-3 ${isCorrect ? "border-green-300 bg-green-50" : isWrong ? "border-red-300 bg-red-50" : "bg-white"}`}>
                            <Input
                              value={gapAnswers[i] || ""}
                              onChange={(e: any) => {
                                const next = [...gapAnswers];
                                next[i] = e.target.value;
                                setGapAnswers(next);
                              }}
                              className={`${isCorrect ? "border-green-500 bg-green-100" : isWrong ? "border-red-400 bg-red-50" : ""}`}
                            />
                            {result && <div className={`mt-2 text-sm ${isCorrect ? "text-green-700" : "text-red-700"}`}>{isCorrect ? "Correct" : `Wrong — correct answer: ${result.blank}`}</div>}
                          </div>
                        );
                      })}
                      {gapResult && <div className="rounded-xl border bg-white p-4 leading-7">{currentCard}</div>}
                      {phase === "gaps" ? (
                        <Button onClick={checkGaps}>Check gaps</Button>
                      ) : gapResult?.every((r: any) => r.correct) ? (
                        <Button onClick={() => setPhase("rewrite")}>Rewrite whole thing</Button>
                      ) : (
                        <Button onClick={() => { setGapSeed((s: number) => s + 1); setGapResult(null); setPhase("gaps"); }}>Try again</Button>
                      )}
                    </>
                  )}

                  {(phase === "rewrite" || phase === "rewrite-feedback" || phase === "rewrite-success") && (
                    <>
                      <div className="text-sm text-slate-600">Now rewrite the full card. Punctuation does not matter.</div>
                      <Textarea value={rewriteInput} onChange={(e: any) => setRewriteInput(e.target.value)} className={`min-h-[160px] ${phase === "rewrite-success" ? "border-green-500 bg-green-50" : phase === "rewrite-feedback" ? "border-red-400 bg-red-50" : ""}`} />
                      {(phase === "rewrite-feedback" || phase === "rewrite-success") && <Comparison diffs={rewriteDiffs} />}
                      <div className="rounded-xl border bg-white p-4 leading-7">{currentCard}</div>
                      {phase === "rewrite" ? (
                        <Button onClick={checkRewrite}>Check rewrite</Button>
                      ) : phase === "rewrite-success" ? (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">Correct. This card is now mastered and removed from practice.</div>
                          {studyCardRealIndex !== null && <Button variant="outline" onClick={() => resetStudy()}>Back to all cards</Button>}
                        </div>
                      ) : (
                        <Button onClick={() => setPhase("rewrite")}>Try again</Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {!currentCard && <div className="rounded-2xl border bg-green-50 p-6 text-green-800">No active cards left in this folder. Restart the folder or add more cards.</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

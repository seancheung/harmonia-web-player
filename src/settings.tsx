import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { IconButton, Modal } from "./components";
import { useApp } from "./context";
import { DialogPresence } from "./dialog-presence";
import type { TextKey } from "./i18n";
import {
  api,
  type Conversion,
  defaults,
  formatBytes,
  type RuleSet,
  type Source,
} from "./model";
import { Select, SelectOption } from "./select";
import { ThemeToggle } from "./theme-toggle";

interface Capabilities {
  formats: string[];
  outputs: string[];
  bitrates: number[];
  sampleRates: number[];
  ffprobe: boolean;
  airplay: boolean;
}
interface Scan {
  running: boolean;
  stopping?: boolean;
  cancelled?: boolean;
  processed: number;
  total: number;
  errors: string[];
  finishedAt: number;
}
interface Cache {
  used: number;
  limit: number;
  pending: number;
  active: number;
}
const blankConversion = (): Conversion => ({
  format: "",
  bitrateOp: "",
  bitrate: 128,
  sampleRateOp: "",
  sampleRate: 44100,
  codec: "mp3",
  outputBitrate: 192,
  outputSampleRate: 0,
});
export function SettingsPage() {
  const { t, lib, prefs, setPrefs, reload, run, notice } = useApp();
  const [source, setSource] = useState<Partial<Source>>();
  const [ruleSet, setRuleSet] = useState<Partial<RuleSet>>();
  const [scan, setScan] = useState<Scan>();
  const [cache, setCache] = useState<Cache>();
  const [limit, setLimit] = useState(5);
  const [tagSeparators, setTagSeparators] = useState(lib.tagSeparators || "");
  useEffect(
    () => setTagSeparators(lib.tagSeparators || ""),
    [lib.tagSeparators],
  );
  const [caps, setCaps] = useState<Capabilities>({
    formats: [],
    outputs: [],
    bitrates: [],
    sampleRates: [],
    ffprobe: true,
    airplay: false,
  });
  const [url, setURL] = useState(prefs.api);
  const [token, setToken] = useState(prefs.token);
  async function refresh() {
    await Promise.all([
      api<Scan>("/scan").then(setScan),
      api<Cache>("/cache").then((c) => {
        setCache(c);
        setLimit(c.limit / 1024 ** 3);
      }),
      api<Capabilities>("/capabilities").then(setCaps),
    ]);
  }
  useEffect(() => {
    void refresh().catch((e) => notice(e.message));
  }, []);
  useEffect(() => {
    if (!scan?.running) return;
    const timer = setInterval(() => {
      void api<Scan>("/scan")
        .then((s) => {
          setScan(s);
          if (!s.running) {
            void reload();
            void refresh();
          }
        })
        .catch((e) => notice(e.message));
    }, 1000);
    return () => clearInterval(timer);
  }, [scan?.running]);
  const preference = <K extends keyof typeof prefs>(
    key: K,
    value: (typeof prefs)[K],
  ) => setPrefs({ [key]: value });
  return (
    <>
      <div className="topbar">
        <nav className="breadcrumb" aria-label={t("breadcrumb")}>
          <Link to="/$section" params={{ section: "home" }}>
            Harmonia
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{t("settings")}</span>
        </nav>
        <ThemeToggle />
      </div>
      <div className="page-content settings-page">
        <header className="page-heading">
          <div>
            <h1>{t("settings")}</h1>
          </div>
        </header>
        <section className="settings-group" aria-labelledby="client-settings">
          <header className="settings-group-heading">
            <h2 id="client-settings">{t("clientSettings")}</h2>
            <p>{t("clientSettingsHint")}</p>
          </header>
          <section className="settings-section">
            <h3>{t("appearance")}</h3>
            <div className="settings-grid">
              <label htmlFor="setting-language">
                {t("language")}
                <Select
                  id="setting-language"
                  value={prefs.language}
                  onChange={(e) =>
                    preference("language", e.target.value as "en" | "zh")
                  }
                >
                  <SelectOption value="en">English</SelectOption>
                  <SelectOption value="zh">
                    {t("simplifiedChinese")}
                  </SelectOption>
                </Select>
              </label>
              <label htmlFor="setting-theme">
                {t("theme")}
                <Select
                  id="setting-theme"
                  value={prefs.theme}
                  onChange={(e) =>
                    preference("theme", e.target.value as typeof prefs.theme)
                  }
                >
                  {["light", "dark", "system"].map((v) => (
                    <SelectOption key={v} value={v}>
                      {t(v as TextKey)}
                    </SelectOption>
                  ))}
                </Select>
              </label>
              {(["accent", "background", "foreground"] as const).map((key) => (
                <label key={key}>
                  {t(key)}
                  <div className="color-field">
                    <input
                      type="color"
                      value={
                        prefs[key] ||
                        (key === "background" ? "#fafafa" : "#252529")
                      }
                      onChange={(e) => preference(key, e.target.value)}
                    />
                    <span>{prefs[key] || t("system")}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="settings-grid glass-settings">
              <label className="check">
                <input
                  type="checkbox"
                  checked={prefs.glass}
                  onChange={(e) => preference("glass", e.target.checked)}
                />
                {t("glass")}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={prefs.glassPopups}
                  disabled={!prefs.glass}
                  onChange={(e) => preference("glassPopups", e.target.checked)}
                />
                {t("glassPopups")}
              </label>
              <label>
                {t("glassBlur")} · {prefs.glassBlur}px
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={prefs.glassBlur}
                  style={
                    {
                      "--progress": `${(prefs.glassBlur / 40) * 100}%`,
                    } as CSSProperties
                  }
                  disabled={!prefs.glass}
                  onChange={(e) =>
                    preference("glassBlur", Number(e.target.value))
                  }
                />
              </label>
              <label>
                {t("glassOpacity")} · {prefs.glassOpacity}%
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="1"
                  value={prefs.glassOpacity}
                  style={
                    {
                      "--progress": `${((prefs.glassOpacity - 60) / 40) * 100}%`,
                    } as CSSProperties
                  }
                  disabled={!prefs.glass}
                  onChange={(e) =>
                    preference("glassOpacity", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <label className="check waveform-setting">
              <input
                type="checkbox"
                checked={prefs.waveform}
                onChange={(e) => preference("waveform", e.target.checked)}
              />
              {t("waveformProgress")}
            </label>
            <button
              type="button"
              className="subtle"
              onClick={() =>
                setPrefs({
                  theme: defaults.theme,
                  accent: defaults.accent,
                  background: "",
                  foreground: "",
                  glass: defaults.glass,
                  glassBlur: defaults.glassBlur,
                  glassOpacity: defaults.glassOpacity,
                  glassPopups: defaults.glassPopups,
                  waveform: defaults.waveform,
                })
              }
            >
              {t("reset")}
            </button>
          </section>
          <section className="settings-section">
            <h3>{t("listening")}</h3>

            <div className="settings-grid">
              <label htmlFor="setting-gain">
                {t("gain")}
                <Select
                  id="setting-gain"
                  value={prefs.gain}
                  onChange={(e) =>
                    preference("gain", e.target.value as typeof prefs.gain)
                  }
                >
                  {["off", "auto", "track", "album"].map((v) => (
                    <SelectOption key={v} value={v}>
                      {t(v as TextKey)}
                    </SelectOption>
                  ))}
                </Select>
              </label>
              <label>
                {t("preamp")}
                <input
                  type="number"
                  min="-30"
                  max="30"
                  step="0.5"
                  value={prefs.preamp}
                  onChange={(e) =>
                    preference(
                      "preamp",
                      Math.max(-30, Math.min(30, Number(e.target.value))),
                    )
                  }
                />
              </label>
              <label htmlFor="setting-failure">
                {t("failure")}
                <Select
                  id="setting-failure"
                  value={prefs.failure}
                  onChange={(e) =>
                    preference(
                      "failure",
                      e.target.value as typeof prefs.failure,
                    )
                  }
                >
                  <SelectOption value="skip">{t("skip")}</SelectOption>
                  <SelectOption value="stop">{t("stop")}</SelectOption>
                </Select>
              </label>
              <label htmlFor="setting-conversion">
                {t("conversion")}
                <Select
                  id="setting-conversion"
                  value={prefs.ruleSet}
                  onChange={(e) => preference("ruleSet", e.target.value)}
                >
                  <SelectOption value="">{t("noConversion")}</SelectOption>
                  {lib.ruleSets.map((s) => (
                    <SelectOption key={s.id} value={s.id}>
                      {s.name}
                    </SelectOption>
                  ))}
                </Select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.protect}
                onChange={(e) => preference("protect", e.target.checked)}
              />
              {t("protect")}
            </label>
            <p className="help">{t("gainHint")}</p>
            <button
              type="button"
              className="subtle"
              onClick={() =>
                setPrefs({ gain: "off", preamp: 0, protect: true })
              }
            >
              {t("reset")}
            </button>
          </section>
          <section className="settings-section">
            <h3>{t("connection")}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPrefs({ api: url.replace(/\/$/, ""), token });
                void reload();
                void refresh().catch((e) => notice(e.message));
              }}
            >
              <label>
                {t("serverURL")}
                <input
                  type="url"
                  placeholder="http://localhost:8090"
                  value={url}
                  onChange={(e) => setURL(e.target.value)}
                />
              </label>
              <label>
                {t("token")}
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <button type="submit" className="primary">
                {t("connect")}
              </button>
            </form>
          </section>
        </section>
        <section className="settings-group" aria-labelledby="server-settings">
          <header className="settings-group-heading">
            <h2 id="server-settings">{t("serverSettings")}</h2>
            <p>{t("serverSettingsHint")}</p>
          </header>
          <section className="settings-section">
            <div className="section-heading">
              <h3>{t("sources")}</h3>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setSource({ name: "", path: "", keep: [], ignore: [] })
                }
              >
                <FolderPlus size={16} />
                {t("addSource")}
              </button>
            </div>
            <div className="source-list">
              {lib.sources.map((s) => (
                <div className="source-card" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <code>{s.path}</code>
                    {s.error && <p className="error-text">{s.error}</p>}
                    <small>
                      {t("keep")}: {s.keep?.join(", ") || "**"} · {t("ignore")}:{" "}
                      {s.ignore?.join(", ") || "—"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSource({ ...s })}
                  >
                    {t("edit")}
                  </button>
                  <IconButton
                    label={t("remove")}
                    onClick={() => {
                      if (confirm(t("sourceRemove")))
                        void run(() => api(`/sources/${s.id}`, "DELETE"));
                    }}
                  >
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              ))}
            </div>
            <p className="help">{t("scanHint")}</p>
            {!caps.ffprobe && (
              <p className="error-text">{t("probeUnavailable")}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="primary"
                disabled={scan?.running}
                onClick={() =>
                  void run(async () =>
                    setScan(await api<Scan>("/scan", "POST")),
                  )
                }
              >
                <RefreshCw size={16} className={scan?.running ? "spin" : ""} />
                {t(scan?.running ? "scanning" : "scan")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={scan?.running}
                onClick={() =>
                  void run(async () =>
                    setScan(await api<Scan>("/scan?force=true", "POST")),
                  )
                }
              >
                {t("rescan")}
              </button>
              {scan?.running && (
                <button
                  type="button"
                  className="secondary"
                  disabled={scan.stopping}
                  onClick={() =>
                    void run(async () =>
                      setScan(await api<Scan>("/scan", "DELETE")),
                    )
                  }
                >
                  {t(scan.stopping ? "scanStopping" : "stopScan")}
                </button>
              )}
            </div>
            {scan && (
              <div className="scan-status">
                {scan.running && (
                  <div
                    className="cache-meter"
                    role="progressbar"
                    aria-label={t("scanning")}
                    aria-valuemin={0}
                    aria-valuemax={scan.total || 1}
                    aria-valuenow={Math.min(scan.processed, scan.total || 1)}
                  >
                    <div
                      style={{
                        width: `${scan.total ? Math.min(100, Math.max(0, (scan.processed / scan.total) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                )}
                <span>
                  {scan.running
                    ? `${scan.processed} / ${scan.total}`
                    : scan.finishedAt
                      ? t(scan.cancelled ? "scanCancelled" : "scanDone")
                      : ""}
                </span>
                {scan.errors?.map((error, i) => (
                  <p className="error-text" key={`${i}-${error}`}>
                    {error}
                  </p>
                ))}
              </div>
            )}
          </section>
          <section className="settings-section">
            <div className="section-heading">
              <h3>{t("conversion")}</h3>
              <button
                type="button"
                className="secondary"
                disabled={!caps.outputs.length}
                onClick={() =>
                  setRuleSet({ name: "", rules: [blankConversion()] })
                }
              >
                <Plus size={16} />
                {t("newRuleSet")}
              </button>
            </div>
            <p className="help">{t("conversionHint")}</p>
            {lib.ruleSets.map((s) => (
              <div className="source-card" key={s.id}>
                <strong>{s.name}</strong>
                <small>
                  {s.rules.length} {t("items")}
                </small>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRuleSet(structuredClone(s))}
                >
                  {t("edit")}
                </button>
                <IconButton
                  label={t("delete")}
                  onClick={() =>
                    void run(() => api(`/rule-sets/${s.id}`, "DELETE"))
                  }
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            ))}
          </section>
          <section className="settings-section">
            <h3>{t("tagSeparators")}</h3>
            <label>
              {t("extraSeparators")}
              <input
                value={tagSeparators}
                maxLength={16}
                placeholder="/"
                onChange={(e) => setTagSeparators(e.target.value)}
              />
            </label>
            <p className="help">{t("tagSeparatorsHint")}</p>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void run(async () => {
                  await api("/tag-settings", "PUT", {
                    separators: tagSeparators,
                  });
                  notice(t("saved"));
                })
              }
            >
              {t("save")}
            </button>
          </section>
          <section className="settings-section">
            <h3>{t("cache")}</h3>
            <div className="cache-meter">
              <div
                style={{
                  width: `${cache?.limit ? Math.min(100, (cache.used / cache.limit) * 100) : 0}%`,
                }}
              />
            </div>
            <p>
              {formatBytes(cache?.used || 0)} /{" "}
              {((cache?.limit || 0) / 1024 ** 3).toFixed(2)} GB{" "}
              {cache?.pending ? ` · ${t("pending")}: ${cache.pending}` : ""}
            </p>
            <div className="cache-actions">
              <label>
                {t("cacheLimit")}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    setCache(
                      await api<Cache>("/cache", "PUT", {
                        limit: Math.round(limit * 1024 ** 3),
                      }),
                    );
                    notice(t("saved"));
                  })
                }
              >
                {t("save")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void run(async () =>
                    setCache(await api<Cache>("/cache", "DELETE")),
                  )
                }
              >
                {t("clearCache")}
              </button>
            </div>
          </section>
        </section>
      </div>
      <DialogPresence>
        {source && (
          <Modal
            title={t(source.id ? "edit" : "addSource")}
            close={() => setSource(undefined)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await run(() =>
                    api(
                      `/sources${source.id ? `/${source.id}` : ""}`,
                      source.id ? "PUT" : "POST",
                      source,
                    ),
                  )
                ) {
                  setSource(undefined);
                  notice(t("saved"));
                }
              }}
            >
              <label>
                {t("sourceName")}
                <input
                  required
                  value={source.name}
                  onChange={(e) =>
                    setSource({ ...source, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t("serverPath")}
                <input
                  required
                  readOnly={!!source.id}
                  placeholder="/music"
                  value={source.path}
                  onChange={(e) =>
                    setSource({ ...source, path: e.target.value })
                  }
                />
              </label>
              {(["keep", "ignore"] as const).map((key) => (
                <label key={key}>
                  {t(key)}
                  <textarea
                    rows={3}
                    placeholder={key === "keep" ? "**/*.flac" : "**/Extras/"}
                    value={(source[key] || []).join("\n")}
                    onChange={(e) =>
                      setSource({
                        ...source,
                        [key]: e.target.value.split("\n"),
                      })
                    }
                  />
                </label>
              ))}
              <p className="help">{t("pathHint")}</p>
              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSource(undefined)}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="primary">
                  {t("save")}
                </button>
              </footer>
            </form>
          </Modal>
        )}
      </DialogPresence>
      <DialogPresence>
        {ruleSet && (
          <Modal title={t("conversion")} close={() => setRuleSet(undefined)}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await run(() =>
                    api(
                      `/rule-sets${ruleSet.id ? `/${ruleSet.id}` : ""}`,
                      ruleSet.id ? "PUT" : "POST",
                      ruleSet,
                    ),
                  )
                ) {
                  setRuleSet(undefined);
                  notice(t("saved"));
                }
              }}
            >
              <label>
                {t("name")}
                <input
                  required
                  value={ruleSet.name}
                  onChange={(e) =>
                    setRuleSet({ ...ruleSet, name: e.target.value })
                  }
                />
              </label>
              {ruleSet.rules?.map((rule, i) => {
                const update = (patch: Partial<Conversion>) =>
                  setRuleSet({
                    ...ruleSet,
                    rules: ruleSet.rules?.map((r, j) =>
                      j === i ? { ...r, ...patch } : r,
                    ),
                  });
                const move = (to: number) => {
                  const rules = [...(ruleSet.rules || [])];
                  if (to < 0 || to >= rules.length) return;
                  [rules[i], rules[to]] = [rules[to], rules[i]];
                  setRuleSet({ ...ruleSet, rules });
                };
                return (
                  <div className="conversion-rule" key={`rule-${i}`}>
                    <header>
                      <strong>#{i + 1}</strong>
                      <IconButton
                        label={t("previous")}
                        onClick={() => move(i - 1)}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton label={t("next")} onClick={() => move(i + 1)}>
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label={t("remove")}
                        onClick={() =>
                          setRuleSet({
                            ...ruleSet,
                            rules: ruleSet.rules?.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </header>
                    <div className="settings-grid">
                      <label htmlFor={`conversion-${i}-format`}>
                        {t("format")}
                        <Select
                          id={`conversion-${i}-format`}
                          values={
                            rule.formats ?? (rule.format ? [rule.format] : [])
                          }
                          onValuesChange={(formats) =>
                            update({ formats, format: "" })
                          }
                          onChange={() => {}}
                        >
                          <SelectOption value="">{t("anyFormat")}</SelectOption>
                          {caps.formats.map((f) => (
                            <SelectOption key={f}>{f}</SelectOption>
                          ))}
                        </Select>
                      </label>
                      {(["bitrate", "sampleRate"] as const).map((key) => (
                        <label key={key}>
                          {t(key)}
                          <div className="numeric-rule">
                            <Select
                              value={rule[`${key}Op`]}
                              onChange={(e) =>
                                update({ [`${key}Op`]: e.target.value })
                              }
                            >
                              <SelectOption value="">
                                {t("unrestricted")}
                              </SelectOption>
                              {["eq", "gt", "gte", "lt", "lte"].map((op) => (
                                <SelectOption key={op} value={op}>
                                  {t(op as TextKey)}
                                </SelectOption>
                              ))}
                            </Select>
                            <input
                              type="number"
                              min="1"
                              disabled={!rule[`${key}Op`]}
                              value={rule[key]}
                              onChange={(e) =>
                                update({ [key]: Number(e.target.value) })
                              }
                            />
                          </div>
                        </label>
                      ))}
                      <label htmlFor={`conversion-${i}-codec`}>
                        {t("codec")}
                        <Select
                          id={`conversion-${i}-codec`}
                          value={rule.codec}
                          onChange={(e) =>
                            update({
                              codec: e.target.value,
                              ...(e.target.value === "opus" &&
                              rule.outputSampleRate !== 0
                                ? { outputSampleRate: 48000 }
                                : {}),
                            })
                          }
                        >
                          {caps.outputs.map((f) => (
                            <SelectOption key={f}>{f}</SelectOption>
                          ))}
                        </Select>
                      </label>
                      {!["flac", "wav"].includes(rule.codec) && (
                        <label htmlFor={`conversion-${i}-outputBitrate`}>
                          {t("outputBitrate")}
                          <Select
                            id={`conversion-${i}-outputBitrate`}
                            value={rule.outputBitrate}
                            onChange={(e) =>
                              update({ outputBitrate: Number(e.target.value) })
                            }
                          >
                            {caps.bitrates.map((n) => (
                              <SelectOption key={n}>{n}</SelectOption>
                            ))}
                          </Select>
                        </label>
                      )}
                      <label htmlFor={`conversion-${i}-outputSampleRate`}>
                        {t("outputSampleRate")}
                        <Select
                          id={`conversion-${i}-outputSampleRate`}
                          value={rule.outputSampleRate ?? 0}
                          onChange={(e) =>
                            update({ outputSampleRate: Number(e.target.value) })
                          }
                        >
                          <SelectOption value={0}>
                            {t("keepSampleRate")}
                          </SelectOption>
                          {(rule.codec === "opus"
                            ? [48000]
                            : caps.sampleRates
                          ).map((n) => (
                            <SelectOption key={n}>{n}</SelectOption>
                          ))}
                        </Select>
                      </label>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setRuleSet({
                    ...ruleSet,
                    rules: [...(ruleSet.rules || []), blankConversion()],
                  })
                }
              >
                <Plus size={15} />
                {t("addRule")}
              </button>
              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRuleSet(undefined)}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="primary">
                  {t("save")}
                </button>
              </footer>
            </form>
          </Modal>
        )}
      </DialogPresence>
    </>
  );
}

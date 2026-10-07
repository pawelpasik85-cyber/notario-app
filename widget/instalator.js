// Notario — widżet kalendarzy (instalator do Scriptable).
// Wklej całość do nowego skryptu w Scriptable i nazwij go „Notario”.
// Przy każdym odświeżeniu pobiera aktualną wersję widżetu (działa też bez sieci).
const BASE = 'https://pawelpasik85-cyber.github.io/notario-app/widget/';
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), 'notario');
if (!fm.fileExists(dir)) fm.createDirectory(dir);
for (const f of ['notario-core.js', 'notario-scriptable.js']) {
  try {
    const s = await new Request(BASE + f + '?t=' + Math.floor(Date.now() / 600000)).loadString();
    if (s && s.length > 500 && s.includes('module.exports')) fm.writeString(fm.joinPath(dir, f), s);
  } catch (e) { /* bez sieci: zostaje poprzednia wersja */ }
}
const core = importModule(fm.joinPath(dir, 'notario-core.js'));
await importModule(fm.joinPath(dir, 'notario-scriptable.js'))(core);
Script.complete();

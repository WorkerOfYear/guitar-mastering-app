"""
MuseScore downloads for the guitar app: GET /score?url=<musescore.com link>&type=pdf|midi|mp3|musicxml with
"Authorization: Bearer <KEY>" returns the file. Only musescore.com score links and four formats are
accepted, so the server can't be used to fetch arbitrary URLs. Personal use: one key, one download at a time.

MuseScore sits behind Cloudflare, which lets a real browser in but not curl or Node (dl-librescore gets 403
even from a home connection). So the score page is opened in FlareSolverr's Chrome — it passes the check —
and the rest is dl-librescore's method run inside that page: the API key is md5(id + type + page + a suffix
from the site's script), /api/jmuse answers with a link to the file on MuseScore's storage, which has no check.
PDF: every page's image, printed by the same Chrome.
MusicXML isn't in that API: it's the site's own Download button, which needs an account (MS_EMAIL, MS_PASSWORD)
and works for free scores only. The session's cookies are kept in /data, so the account logs in rarely.
"""

import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, "/app")
import utils  # FlareSolverr: get_webdriver() starts Chrome so that Cloudflare lets it in
from flaresolverr_service import click_verify
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By

# SCORE_KEY: the name in the shared .env of server/production and server/dev-stand; KEY: running on its own.
KEY = os.environ.get("SCORE_KEY") or os.environ.get("KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "150"))
IDLE_SECONDS = 600  # the browser takes up to 1 GB, so it closes when nobody downloads
SCORE_URL = re.compile(r"^https://(?:(?:s|www)\.)?musescore\.com/\S+$")
FILE_HOSTS = re.compile(r"^https://([a-z0-9-]+\.)*(musescore\.com|ustatik\.com)/")
TYPES = {"pdf": "application/pdf", "midi": "audio/midi", "mp3": "audio/mpeg", "musicxml": "application/vnd.recordare.musicxml"}
EXT = {"pdf": "pdf", "midi": "mid", "mp3": "mp3", "musicxml": "mxl"}
MS_EMAIL = os.environ.get("MS_EMAIL", "")
MS_PASSWORD = os.environ.get("MS_PASSWORD", "")
COOKIES = "/data/cookies.json"

browser_lock = threading.Lock()
driver = None
last_used = 0.0


class Failure(Exception):
    pass


def get_driver():
    global driver
    if driver is None:
        driver = utils.get_webdriver()
        driver.set_page_load_timeout(20)
    return driver


def go(d, url):
    """Opens a musescore.com page, waiting out Cloudflare's check (clicking its checkbox if it shows one)."""
    # The page's ads can keep it "loading" for minutes; what's needed here comes with the HTML.
    try:
        d.get(url)
    except TimeoutException:
        pass
    for i in range(60):
        if d.title != "Just a moment...":
            return
        if i % 8 == 7:
            click_verify(d)
        time.sleep(1)
    raise Failure("MuseScore не открылся: проверка Cloudflare не пройдена")


def close_driver():
    global driver
    if driver is not None:
        try:
            driver.quit()
        except Exception:
            pass
        driver = None


def close_when_idle():
    while True:
        time.sleep(60)
        if driver is not None and time.time() - last_used > IDLE_SECONDS and browser_lock.acquire(blocking=False):
            try:
                close_driver()
            finally:
                browser_lock.release()


def open_score(d, url):
    """Opens the score page; its id and title."""
    go(d, url)
    for _ in range(30):
        info = d.execute_script("""
            const m = (p) => document.querySelector(`meta[property='${p}']`)?.content ?? '';
            const id = (m('al:ios:url').match(/(\\d+)$/) || [])[1];
            return id ? { id, title: m('og:title') } : null;
        """)
        if info:
            return info
        time.sleep(1)
    raise Failure("Это не страница нот MuseScore")


def api_suffix(d):
    """The secret part of the API key, from the site's own script (as dl-librescore finds it)."""
    suffix = d.execute_async_script("""
        const done = arguments[arguments.length - 1];
        const urls = [...document.head.innerHTML.matchAll(/link.+?href=["'](https:\\/\\/musescore\\.com\\/static\\/public\\/build\\/musescore.*?(?:_es6)?\\/20.+?\\.js)["']/g)].map((m) => m[1]);
        (async () => {
          for (const u of urls) {
            const m = (await (await fetch(u)).text()).match(/"([^"]+)"\\)\\.substr\\(0,4\\)/);
            if (m) return done(m[1]);
          }
          done(null);
        })().catch(() => done(null));
    """)
    if not suffix:
        raise Failure("Не нашёл ключ API на странице MuseScore — сайт, видимо, поменялся")
    return suffix


def file_links(d, score_id, kind, indexes, suffix):
    """Asks /api/jmuse from inside the page (past Cloudflare) for links to the files; None where there is none.
    The API signs a link for any page number, even past the end: those links answer 404."""
    requests = [
        [f"/api/jmuse?id={score_id}&type={kind}&index={i}", hashlib.md5(f"{score_id}{kind}{i}{suffix}".encode()).hexdigest()[:4]]
        for i in indexes
    ]
    texts = d.execute_async_script("""
        const done = arguments[arguments.length - 1];
        Promise.all(arguments[0].map(([url, auth]) =>
          fetch(url, { headers: { Authorization: auth } }).then((r) => r.text()).catch(() => ''))).then(done);
    """, requests)
    links = []
    for text in texts:
        try:
            url = (json.loads(text).get("info") or {}).get("url")
        except ValueError:
            url = None
        links.append(url if url and FILE_HOSTS.match(url) else None)
    return links


def page_count(d):
    """Pages of the score as the page lays them out (dl-librescore's way: the scroller's children minus 3)."""
    for _ in range(10):
        n = d.execute_script("return document.querySelector('#jmuse-scroller-component')?.children.length ?? 0")
        if n > 3:
            return min(n - 3, MAX_PAGES)
        time.sleep(1)
    return None


def download(url, user_agent):
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def download_pages(links, user_agent):
    """Page images, downloaded in parallel; stops at the first page that isn't there (404)."""
    def one(link):
        try:
            return download(link, user_agent) if link else None
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            raise

    with ThreadPoolExecutor(8) as pool:
        datas = list(pool.map(one, links))
    pages = []
    for data in datas:
        if data is None:
            break
        pages.append((data, "image/svg+xml" if data.lstrip()[:4] in (b"<svg", b"<?xm") else "image/png"))
    return pages


def make_pdf(d, pages):
    """Prints the page images (SVG or PNG) into a PDF, one image per sheet, sized like the first page."""
    first = pages[0][0]
    w, h = 210, 297
    m = re.search(rb'<svg[^>]*\bwidth="([\d.]+)[^"]*"[^>]*\bheight="([\d.]+)', first[:2000])
    if m:
        w, h = 210, round(210 * float(m.group(2)) / float(m.group(1)))
    imgs = "".join(
        f'<img src="data:{mime};base64,{base64.b64encode(data).decode()}">' for data, mime in pages
    )
    d.get("about:blank")
    d.execute_script(
        "document.open(); document.write(arguments[0]); document.close();",
        f"<html><head><style>@page {{ size: {w}mm {h}mm; margin: 0 }} body {{ margin: 0 }}"
        f" img {{ display: block; width: {w}mm; height: {h}mm; object-fit: contain; break-after: page }}</style></head>"
        f"<body>{imgs}</body></html>",
    )
    d.execute_async_script("""
        const done = arguments[arguments.length - 1];
        Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => done());
    """)
    r = d.execute_cdp_cmd("Page.printToPDF", {"preferCSSPageSize": True, "printBackground": True})
    return base64.b64decode(r["data"])


def file_name(info):
    return re.sub(r'[\\/:*?"<>|]+', "", info["title"]).strip() or f"score-{info['id']}"


def logged_in(d):
    """The header has "Profile menu for <user>" when signed in, a "Log in" button when not; waits for either."""
    for _ in range(15):
        state = d.execute_script("""
            const buttons = [...document.querySelectorAll('header button')];
            if (buttons.some((b) => (b.getAttribute('aria-label') || '').startsWith('Profile menu'))) return 'in';
            if (buttons.some((b) => b.innerText.trim() === 'Log in')) return 'out';
            return null;
        """)
        if state:
            return state == "in"
        time.sleep(1)
    return False


def log_in(d):
    """Makes the browser signed in to the account: saved cookies first, the login form when they don't work."""
    if not MS_EMAIL or not MS_PASSWORD:
        raise Failure("Для MusicXML серверу нужен аккаунт MuseScore (MS_EMAIL и MS_PASSWORD в .env)")
    go(d, "https://musescore.com/")
    if logged_in(d):
        return
    try:
        with open(COOKIES) as f:
            for c in json.load(f):
                c.pop("sameSite", None)
                try:
                    d.add_cookie(c)
                except Exception:
                    pass
        go(d, "https://musescore.com/")
        if logged_in(d):
            return
    except (OSError, ValueError):
        pass
    go(d, "https://musescore.com/user/login")
    d.find_element(By.ID, "username").send_keys(MS_EMAIL)
    d.find_element(By.ID, "password").send_keys(MS_PASSWORD)
    d.find_element(By.XPATH, "//button[@type='submit' and normalize-space()='Log in']").click()
    for _ in range(20):
        time.sleep(1)
        if "/user/login" not in d.current_url:
            break
    go(d, "https://musescore.com/")
    if not logged_in(d):
        raise Failure("Не получилось войти в аккаунт MuseScore — проверь логин и пароль в .env")
    print("logged in to MuseScore", flush=True)
    try:
        with open(COOKIES, "w") as f:
            json.dump(d.get_cookies(), f)
        os.chmod(COOKIES, 0o600)
    except OSError as e:
        print(f"cookies not saved: {e}", flush=True)


def click_text(d, selector, text):
    for el in d.find_elements(By.CSS_SELECTOR, selector):
        if el.is_displayed() and el.text.strip().split("\n")[0].strip() == text:
            el.click()
            return True
    return False


def download_musicxml(d, url):
    """The site's Download → MusicXML, signed in; the file the browser saves."""
    log_in(d)
    info = open_score(d, url)
    folder = tempfile.mkdtemp()
    try:
        d.execute_cdp_cmd("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": folder})
        for _ in range(10):
            if click_text(d, "button", "Download"):
                break
            time.sleep(1)
        else:
            raise Failure("На странице нот нет кнопки Download")
        for _ in range(10):
            time.sleep(1)
            if click_text(d, "[role=dialog] button", "MusicXML"):
                break
            if d.execute_script("return /Buy this score|Unlock this score/.test(document.querySelector('[role=dialog]')?.innerText ?? '')"):
                raise Failure("Эти ноты на MuseScore платные — MusicXML без покупки не скачать")
        else:
            raise Failure("MuseScore не предложил MusicXML")
        for _ in range(30):
            time.sleep(1)
            if d.execute_script("return /Buy this score|Unlock this score/.test(document.querySelector('[role=dialog]')?.innerText ?? '')"):
                raise Failure("Эти ноты на MuseScore платные — MusicXML без покупки не скачать")
            files = [f for f in os.listdir(folder) if not f.endswith(".crdownload")]
            if files:
                with open(os.path.join(folder, files[0]), "rb") as f:
                    return f.read(), info
        raise Failure("MuseScore не отдал MusicXML")
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def fetch_score(url, kind):
    """(file bytes, file name) of the score in one format."""
    global last_used
    with browser_lock:
        last_used = time.time()
        try:
            d = get_driver()
            if kind == "musicxml":
                data, info = download_musicxml(d, url)
                return data, f"{file_name(info)}.mxl"
            info = open_score(d, url)
            suffix = api_suffix(d)
            ua = d.execute_script("return navigator.userAgent")
            name = file_name(info)
            if kind != "pdf":
                link = file_links(d, info["id"], kind, [0], suffix)[0]
                if not link:
                    raise Failure("MuseScore не отдал файл — у этих нот его может не быть")
                return download(link, ua), f"{name}.{EXT[kind]}"
            count = page_count(d)
            if count:
                pages = download_pages(file_links(d, info["id"], "img", range(count), suffix), ua)
            else:  # the layout didn't say: go in batches until the pages run out
                pages = []
                for start in range(0, MAX_PAGES, 10):
                    batch = download_pages(file_links(d, info["id"], "img", range(start, start + 10), suffix), ua)
                    pages += batch
                    if len(batch) < 10:
                        break
            if not pages:
                raise Failure("MuseScore не отдал страницы нот")
            return make_pdf(d, pages), f"{name}.pdf"
        except Failure:
            raise
        except Exception:
            close_driver()  # a broken browser is started anew next time
            raise
        finally:
            last_used = time.time()


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization")
        self.send_header("Access-Control-Expose-Headers", "X-Name")

    def fail(self, code, message):
        body = json.dumps({"error": message}, ensure_ascii=False).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/health":
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            return self.wfile.write(b"ok")
        if url.path != "/score":
            return self.fail(404, "Нет такого адреса")
        if not KEY or self.headers.get("Authorization", "") != f"Bearer {KEY}":
            return self.fail(401, "Неверный ключ")
        q = urllib.parse.parse_qs(url.query)
        kind = q.get("type", [""])[0]
        link = q.get("url", [""])[0]
        if kind not in TYPES:
            return self.fail(400, "Формат: pdf, midi, mp3 или musicxml")
        if not SCORE_URL.match(link):
            return self.fail(400, "Нужна ссылка на ноты с musescore.com")
        try:
            data, name = fetch_score(link, kind)
        except Failure as e:
            return self.fail(502, str(e))
        except Exception as e:
            print(f"error: {e!r}", flush=True)
            return self.fail(502, "Не удалось скачать с MuseScore, попробуй ещё раз")
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", TYPES[kind])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Name", urllib.parse.quote(name))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("Задай KEY — без ключа сервер не запустится")
    utils.get_user_agent()  # as FlareSolverr does at start: later browsers get a User-Agent without "Headless"
    threading.Thread(target=close_when_idle, daemon=True).start()
    print(f"listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

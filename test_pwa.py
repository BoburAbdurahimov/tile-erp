"""The site installs as an app: the manifest, service worker and icons are
served from where browsers look for them, and the page links to them."""
import json
import unittest

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


class TestPwa(unittest.TestCase):

    def test_manifest(self):
        res = client.get("/manifest.webmanifest")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.headers["content-type"].startswith("application/manifest+json"))
        m = json.loads(res.content)
        self.assertEqual(m["display"], "standalone")
        self.assertEqual(m["start_url"], "/")
        sizes = {(i["sizes"], i.get("purpose", "any")) for i in m["icons"]}
        self.assertLessEqual({("192x192", "any"), ("512x512", "any"), ("512x512", "maskable")}, sizes)
        for icon in m["icons"]:                                   # every icon really exists
            r = client.get(icon["src"])
            self.assertEqual(r.status_code, 200, icon["src"])
            self.assertEqual(r.headers["content-type"], "image/png")

    def test_service_worker_at_root(self):
        res = client.get("/sw.js")
        self.assertEqual(res.status_code, 200)
        self.assertIn("javascript", res.headers["content-type"])
        self.assertEqual(res.headers["cache-control"], "no-cache")
        self.assertIn("/static/offline.html", res.text)
        self.assertEqual(client.get("/static/offline.html").status_code, 200)

    def test_page_links_the_app(self):
        res = client.get("/")
        self.assertEqual(res.headers["cache-control"], "no-cache")      # a new deploy reaches the installed app
        html = res.text
        for tag in ('rel="manifest" href="/manifest.webmanifest"', 'rel="apple-touch-icon"',
                    'name="theme-color"', "/static/js/pwa.js", "data-pwa-install"):
            self.assertIn(tag, html)
        self.assertEqual(client.get("/favicon.ico").status_code, 200)


if __name__ == "__main__":
    unittest.main()

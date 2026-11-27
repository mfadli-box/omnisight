import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'test_flows'))
from cm01_support import CM01Case, MockHRIS

class Guard(CM01Case):
    def test_xxe_dtd_does_not_authenticate(self):
        self.linked()
        MockHRIS.response = b'<!DOCTYPE string [<!ENTITY x "1|---|injected">]><string xmlns="App.Login">&x;</string>'
        self.assertEqual(self.login()[0], 401)

    def test_unapproved_host_and_url_features_rejected(self):
        for url in ('http://localhost:1234/', 'http://169.254.169.254/', self.url+'?x=1', self.url+'#fragment', self.url.replace('http://', 'http://user@')):
            with self.subTest(url=url):
                self.linked(url)
                self.assertEqual(self.login()[0], 503)
        self.assertEqual(MockHRIS.hits, 0)

    def test_redirect_not_followed(self):
        self.linked()
        MockHRIS.status = 302
        MockHRIS.location = self.url + "/redirect-target"
        self.assertEqual(self.login()[0], 401)
        self.assertEqual(MockHRIS.hits, 1)

if __name__ == '__main__': unittest.main()

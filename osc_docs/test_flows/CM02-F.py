import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cm02_support import CM02Case


class Functional(CM02Case):
    def test_default_company_context(self):
        status, body = self.context()
        self.assertEqual(status, 200)
        self.assertEqual(body['company_id'], str(self.company))
        self.assertIsNone(body['area_id'])

    def test_authorized_company_and_area(self):
        status, body = self.context([('company_id', str(self.company)), ('area_id', str(self.area))])
        self.assertEqual(status, 200)
        self.assertEqual(body['company_id'], str(self.company))
        self.assertEqual(body['area_id'], str(self.area))
        self.assertTrue(body['permissions']['can_read'])


if __name__ == '__main__':
    unittest.main()

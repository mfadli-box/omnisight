import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'test_flows'))
from cm02_support import CM02Case


class Guard(CM02Case):
    def test_other_company_forbidden(self):
        self.assertEqual(self.context([('company_id', str(self.other_company))])[0], 403)

    def test_other_and_ungranted_area_forbidden(self):
        for area in (self.other_area, self.ungranted_area):
            with self.subTest(area=area):
                self.assertEqual(self.context([('area_id', str(area))])[0], 403)

    def test_duplicate_selectors_and_missing_permission_forbidden(self):
        self.assertEqual(self.context([('company_id', str(self.company)), ('company_id', str(self.other_company))])[0], 403)
        self.assertEqual(self.context([('area_id', str(self.area)), ('area_id', str(self.ungranted_area))])[0], 403)
        self.assertEqual(self.context(permissions=False)[0], 403)

    def test_rls_enabled_and_policy_present_for_area(self):
        with self.db.cursor() as cur:
            cur.execute("SELECT c.relrowsecurity, EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) FROM pg_class c WHERE c.oid='dat_area'::regclass")
            enabled, policy = cur.fetchone()
        self.assertTrue(enabled, 'RLS belum diaktifkan pada dat_area')
        self.assertTrue(policy, 'Kebijakan RLS dat_area belum tersedia')


if __name__ == '__main__':
    unittest.main()

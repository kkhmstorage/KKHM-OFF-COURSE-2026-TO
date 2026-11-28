# പുതിയ സ്ഥാപനത്തിന് സിസ്റ്റം സജ്ജമാക്കൽ / Setting up for another college

ഓരോ കോളേജിനും **സ്വന്തം ഡാറ്റാബേസും സ്വന്തം വെബ് വിലാസവും** — ഒരു കോളേജിന്റെ ഡാറ്റ മറ്റൊന്നിന് ഒരിക്കലും കാണാനാവില്ല.
കോഡ് ഒന്നുതന്നെ; മാറ്റേണ്ടത് ക്രമീകരണങ്ങൾ മാത്രം. ഏകദേശം 30 മിനിറ്റ്.

## 1. ഡാറ്റാബേസ് (Supabase)
1. https://supabase.com-ൽ പുതിയ project (Region: Mumbai).
2. SQL Editor → `supabase/COMPLETE_ONE_CLICK_SETUP.sql` മുഴുവൻ പേസ്റ്റ് ചെയ്ത് **Run** (ഒരിക്കൽ മാത്രം).
3. Project Settings → API → `Project URL`, `anon public key` കോപ്പി ചെയ്യുക. `service_role` key ഒരിക്കലും എവിടെയും വയ്ക്കരുത്.

## 2. വെബ്സൈറ്റ് (GitHub Pages)
1. ഈ repository **Fork** ചെയ്യുക (ഉദാ: `college-name-offcourse`).
2. Settings → Secrets and variables → Actions → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ചേർക്കുക.
3. Settings → Pages → Source: **GitHub Actions**.
4. Actions ടാബിൽ "Deploy" പച്ചയായാൽ സൈറ്റ് തയ്യാർ.

## 3. ആദ്യ ലോഗിൻ
- Username `kkhm`, password `kkhm123.@` (ഇത് പരസ്യമാണ് — ആദ്യ ലോഗിനിൽ തന്നെ മാറ്റാൻ സിസ്റ്റം നിർബന്ധിക്കും).
- Settings → Institution Name, Short Name, CIC College Code, Address, Logo എന്നിവ നൽകുക.

## 4. അക്കാദമിക് വിവരങ്ങൾ
1. **Off-Course (CIC) → കോഴ്സ് ചാർട്ട്**: ഓരോ ഘട്ടത്തിലെയും സെമസ്റ്ററിലെയും വിഷയങ്ങൾ — Core / Elective / Interdisciplinary, ക്രെഡിറ്റ്; തംഹീദിയ്യയിലെ ഉറുദുവിന് "ഉറുദു" ടിക്ക്.
2. Students → വിദ്യാർത്ഥികളെ ചേർക്കുക (ഓരോരുത്തർക്കും വ്യത്യസ്ത പാസ്‌വേഡ്).
3. Off-Course → വിദ്യാർത്ഥികൾ → **ഘട്ടം** (തംഹീദിയ്യ / ആലിയ / പി.ജി, സെമസ്റ്റർ).
4. Timetable → ക്ലാസ് ടൈംടേബിൾ; ഓരോ പീരിയഡിനും വിഷയം നൽകിയാൽ, ആ വിഷയം ഒഴിവാക്കിയ വിദ്യാർത്ഥിക്ക് അത് സ്വയം Off-Course ആയി മാറും.
5. Login & Passwords → പാസ്‌വേഡ് സ്ലിപ്പുകൾ പ്രിന്റ് ചെയ്ത് വിതരണം ചെയ്യുക.

## നിലവിലുള്ള ഇൻസ്റ്റലേഷൻ പുതുക്കാൻ (KKHM)
SQL Editor-ൽ ക്രമത്തിൽ, ഓരോന്നും ഒരിക്കൽ: `006_security_hardening.sql`, ശേഷം `007_offcourse_rules_and_password_vault.sql`.
**ആദ്യം Supabase-ൽ ബാക്കപ്പ് എടുക്കുക.** SQL ഓടിച്ച ശേഷം മാത്രം പുതിയ കോഡ് main-ലേക്ക് merge ചെയ്യുക.

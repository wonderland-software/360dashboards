# COVERAGE

How far Blades 6770 and NXE 9199 are from COMPLETE in the browser: every
screen, list, option, page, transition, sound and string an offline,
no-profile, no-disc console could show. Measured 2026-09-03 at commit
`c4bc386` three ways, by an auditor who changed nothing:

1. **Data reach.** Every scene the executable can navigate to offline,
   enumerated from `extracted/6770` and `extracted/9199` (the glue specs'
   tables: `PressPath` / `PanelScenePaths` / `DefaultBanner` / TraySceneLoader
   edges out of all 263 + 311 scenes, the code tables at 0x920143d0,
   0x927bfff0, 0x92016a90, 0x927f0ae0, the channel XML, the Rome root
   classes), then checked against what `dashboards/*` and `app/main.ts`
   mount. Same for strings, cues and images.
2. **Behaviour reach.** Both shells driven headless (puppeteer-core against a
   private vite on :5277, `&manual&mute`, `window.__dashApi`) through every
   input path: every blade and channel, every row, A into every row, every
   option list, B out, list ends, X/Y/Start/Back/Guide/LB/RB/LT/RT. 640
   screens recorded on Blades, 335 on NXE, zero page errors on either. Per
   screen: what mounted, what focus did, what A did, painted `<...>` tokens,
   cues, `__dash` errors.
3. **Judged reach.** What the PASS verdicts in `JUDGE.md` and the smoke gates
   actually walked, against what has never been walked by anyone.

The drive scripts, the raw JSON (640 + 335 screens) and the two census
reports (`data-6770.md`, `data-9199.md`, with the BFS over every scene's
edges) are in the auditor's scratchpad, not in the repo; the numbers below
are what they printed.

---

## A. Scoreboard

### Blades 6770

| measure | number |
|---|---|
| scenes in the dump | 263 |
| scenes the console can reach offline from home (pages + the metapane/banner/tray sub-scenes they load) | **85** (89 with the 3 IPTV and 1 PAL-gated) |
| of those the shell's mechanism can mount | 74 (11 cannot: 9 pages + 2 sub-scenes, listed in B) |
| distinct page scenes actually reached by input in the drive | **50** |
| pages reached whose rows do what the console does on A (push a page, or nothing by design) | 14 |
| pages reached where A on the focused row does NOTHING and should do something offline | **31** (21 option pages, 4 blade rows, 6 code-path rows, see B) |
| pages reached with an empty list the console fills (undecoded or unwired) | 8 (HiDef, ClockTime x5 spinners, FamilyTimer, PControlGame/Movie/TV ratings, DeviceSelector, ConnStatus) |
| pages reached that paint an authoring token | 2 at the time of this audit (`<text>` on `arcade/2500_LiveArcadeHome`; `<device type>`, `<device connection string>`, `<device name>`, `<help text>` on `dashcomm/742_SelectNetworkDevice`), then 2 MORE that no detector could see (see the M3h note under D). **0 as of M3h**, measured over all 50 reached pages by `smoke-nav` §11 |
| pad buttons routed / doing anything | 11 / 7 (X, Y, Start, Back do nothing; LT/RT/sticks unused by the console too) |
| blade switches: ranges + cues correct | 8 / 8 |
| list ends: clamped and silent (no authored `Wrap`) | 47 / 47 walked; `dashSysLiveVision` wraps because its list authors `Wrap` |
| `.xma` cues in the dump / fired by the shell / authored but never fired / orphans with no keyframe anywhere | 16 / 10 / 3 (`btn_InactiveSelect` on `PressDisable`, `tab_Switch` on 2 unreachable scenes, `dash_3rdLevelOpen` only inside `OOBEDone`) / 3 (`btn_InactiveFocus`, `dash_BladeLand`, `dash_Blink`) |
| positional string tables in the packs the offline tree touches / read by the shell | 12 tables, 1,813 entries / 2 tables (`dashStrings.xus` 4 indices, `dashCSettingsStrings.xus` ~345 indices); `oobeStrings.xus`, `memory/Strings.xus` (99), `network/Strings.xus` (304), `music/Strings.xus` (81) untouched because their pages are unreachable or unfilled |
| per-scene locale tables: reachable scenes with all 11 locale siblings | 85 / 85; `&locale=` patches every pushed scene |
| bitmap `ImagePath`s on the 85 offline scenes / absent from the manifest | 97 / 1 (`250x_metaAchievements.xui`, an authoring artifact); `missingImages` was 0 on every driven screen |
| judged by a PASS: pages | 5 blades + `dashSysCslSet` + `dashSysCslSetDisplay` (Judge E r2) + `Audio`, `AudioDigital` (smoke-nav gate) = **9 of 50** reached pages; the other 41 have never been judged or gated |

### NXE 9199

| measure | number |
|---|---|
| scenes in the dump | 311 |
| scenes in the EVIDENCED offline-reachable tree (scene-data edges + the two code tables + the Rome root classes the binary registers) | **106** (110 with IPTV/Live gated) |
| plus the offline pool whose binding is code only (games/arcade 12, videos 12, music 20, pictures 2, memory 22, noobe 6, signin 4, network tests) | ~90 |
| scenes the shell mounts by input | **40** (7 home composition + 17 slot scenes + `SystemScene` + 6 nav pages + 8 Console Settings pages + `2004_NetworkDetails`) |
| of those 40, pages that are DEAD ENDS (arrive with no focusable row, or rows whose A does nothing) | **13** |
| evidenced offline scenes with no mount at all | 66 |
| home page: slots on screen / slots whose A does anything | 17 / **1** (Settings). 7 of 8 My Xbox slots and all 9 slots of the six other channels are silent refusals |
| Console Settings: rows / sub-pages that arrive with focus and working rows | 8 / **0** (System Info has nothing to focus by design; the other 7 have `btn*` rows the shell ignores) |
| pages that paint `<setting>` | **7** (Display, Audio, Language and Locale, Clock, Startup and Shutdown, Auto-Play, Remote Control); Judge G's R5 counted one |
| pad buttons routed / doing anything | 11 / 6 (X, Y, Start, Back, LB, RB nothing; Left/Right refused inside every page) |
| channel changes, panel moves, fold on A, unfold on B: measured against footage | yes (Judge G r2), residuals R1-R4 open |
| `.xma` cues in the dump / fired by the shell | 17 / 11 (8 table cues + `snd_transitioninto/from` from the `SceneTransitions` range + `btn_Focus` on hosted-page moves). `btn_Select` and `btn_Back` NEVER fire on NXE: `pressPage` and `back` play the table cue and never set the row's or `legend_b`'s `Press` state, so the two `shrdres` cues the skin authors on every button are silent on every hosted page; `btn_InactiveFocus/Select` and both `tab_Switch` copies never |
| positional tables read by the shell / indices hard-coded | `homepage/strings.xus` 21 of 25 (IDS_SELECT, IDS_SELECTSLOT, IDS_TELLMEMORE fall back); `dashcomm/dashStrings.xus` 6 of 176; `consoles/dashCSettingsStrings.xus` 16 of 621 wired (+7 Display labels declared, unwired) |
| authored `<...>` tokens on reachable scenes / on shell-mounted pages / painted in the drive | 59 on 40 scenes / 14 / 7 (`<setting>` x7; `DeviceSelector`'s `<#> of <Total #>` is mounted but was not visible in the drive) |
| bitmap `ImagePath`s on the reachable tree / absent from the manifest | 121 / 0; on driven screens `missingImages` = 1 (`common://updis.png`, a skin path, allowlisted) and unresolved visuals 2 (`tab_active_glow_2/3`, allowlisted) |
| judged by a PASS: home (8 slots by Right), `SystemScene`, `dashSysCslSet`, the channel change (Judge G r2); smoke-only: `arcade/CollectionFilterPanel` geometry, the WELCOME names | **3 of 16** reached pages; 13 never judged |

**Distance from complete, in one line each.** Blades: every settings page
opens and looks right, and then A does nothing on 31 of them; three of the
five blades have an offline row that leads nowhere. NXE: the home page moves
like the console and one slot works; the seven settings pages under it are
pictures.

---

## B. Punch list, ranked by what a player meets first

Size: S = under a day, M = a few days, L = a week or more. "Console does"
cites the glue spec (§), a code address, or a footage frame; "[INFER]" marks
what the material does not settle.

### Blades 6770

| # | scene | how you get there | console does | we do | size |
|---|---|---|---|---|---|
| B1 | 21 option pages under Console Settings: `dashSysCslSetDisplayFormat` (btnNormal/btnWide), `OutputLevels` (3), `AudioDigital` (listOptions x3), `AudioSoundEffects` (x2), `Language` (lstLanguages x11), `ClockFormat` (x2), `ClockTimeZone` (x75), `ClockDaylightSavings` (x2), `Country` (lstCountries x37), `StartUp` (btnDefault/Dashboard/MediaCenter/IPTV), `AutoOff` (On/Off), `BackgroundDownloads` (On/Off), `Screensaver` (On/Off), `RemoteC` (listChannels x2), `PControlVideoExplicit`/`Unrated`/`LiveA`/`LiveC`/`Content` (Yes/No), `PControlPasscodeHint` (x5), `dashSysLiveVision` (BrightnessSetting x3) | System > Console Settings > row > A > option > A | Each row's `handler` (the third field of the 0x920143d0 record and its children's tables, e.g. `dashVideoSettings` 0x921c72f0, `dashCLanguage` 0x921cbd20) writes the setting through the XConfig thunks (displaySettings.ts §2), rewrites the page's `labCurrentSetting` and the parent's `Current Setting` block, and plays the row's `Press` [SPEC §3.6, displaySettings.ts]. [INFER] whether the page pops back to its parent on A: the 8498 capture walks clock format and background downloads at 1000-1200 s (nxe-README) and is the only footage of a selection; not read for this audit. | `btn_Select` fires, then `codePaths` gets a line and nothing else changes; the option pages are read-only pictures. 129 dead A-presses in the drive. | L: a per-page "selected value" model (the value is device state, so it starts where the hardware-state rows already say and is disclosed), the Current Setting rewrite, and the pop rule once the 8498 frames settle it |
| B2 | `mediabla/mediaSignedOut.xur` rows Music, Pictures, Videos | Media blade > row > A | Code path: `PressPath` names `1000_MusicMain.xur` / `900_PicturesMain.xur` / `VideosMain.xur`, none in the dump; the console opens `dashcomm/MediaSourceSelection.xur` and then `music/1003_IndividualDevice`, `pictures/905_IndividualDeviceMain`, `videos/Video` [SPEC §4, INFER on the exact chain]; all four scenes are in the dump, and `MediaSourceSelection`'s device list is device state | `unresolvedPresses` gets `navMusic -> 1000_MusicMain.xur`; nothing opens | M for MediaSourceSelection with an empty, disclosed device list; the device pages behind it are hardware |
| B3 | `gamesbla/gamesSignedOut.xur` row Create Gamer Profile | Games blade > Down > A | Code path into `oobe/oobeProfileCreation.xur` [SPEC §4]; the scene is in the dump (oobe pack: 9 scenes) | `codePaths` gets a line; nothing opens | M (one page; the profile it would create is device state, so its Done is the honest stop) |
| B4 | `dashmain#System` row Initial Setup | System > row 7 > A | Raises the confirmation dialog at 0x92114a98 (title `dashCSettingsStrings.xus[176]`, body [179], buttons [177]/[178]), then runs the OOBE from `oobe/oobeWelcome.xur` [SPEC §3.4, §4] | nothing (`codePaths`) | S for the dialog (strings are in the table, the dialog scene is `dashcomm`'s msgbox, to be identified); L for the OOBE chain |
| B5 | `dashcomm/742_SelectNetworkDevice.xur` (Computers) and `arcade/2500_LiveArcadeHome.xur` (Games Library) | System > Computers > A; Games > Games Library > A | The console overwrites every angle-bracket token before the control shows [PLACEHOLDERS, CODE 0x9226e6c0 for the IPTV case] | `<device type>`, `<device connection string>`, `<device name>`, `<help text>` painted on Computers; `<text>` painted on the Arcade home. `discloseHardwareState` runs on push and the tokens live in the metapane sub-scene / banner that `loadMetaScene` and `fillContainers` load afterwards | S (run the clear on every sub-scene load) |
| B6 | `consoles/dashSysCslSetDisplay.xur` right pane (`scnCurrentFormat`) | System > Console Settings > Display | Loads `consoles/metaPane_DisplayNormal.xur` or `metaPane_DisplayWidescreen.xur` by the video mode [SPEC §3.7; FRAME 6717-60fps f01580 shows the Widescreen pane] | pane empty: `displaySettings.ts` names both files, nothing loads them (0 references in the shell) | S (the reference console is widescreen, already a hardware-state row) |
| B7 | `PControlGame`, `PControlVideoMovie`, `PControlVideoTV` (`lstRating`) | System > Family Settings > Console Controls > Game / Video > Movie / TV | Picks one of 29 tables at 0x920163a0 by `XC_LOCALE` through the 39-row locale table at 0x92016530 [pcontrolSettings.ts §3]; the reference console's locale is United Kingdom, already a hardware-state row | all three lists empty; the tables are fully decoded in `pcontrolSettings.ts` and not wired (`CODE_LISTS_NOT_FILLED`) | S |
| B8 | `dashSysCslSetClockTime.xur` five spinners | Console Settings > Clock > Date and Time | `sprintf`s hours/minutes/day/month/year ranges (`%0*d` at 0x921cc4c0, days from 0x92017040, years 2005-2025) parked on the console clock [codeLists.ts] | five empty spinners; `lstAMPM` alone is authored | S for the ranges; the parked VALUE is the console's RTC, which is exactly what the host clock is, so parking on it and saying so in `hardwareState` is not an invention |
| B9 | X and Y anywhere | any page | `legend_y` on `memory/DeviceSelector` is "Device Options" (enabled, `PressKey` 0x5803); `btnY` on `PControlFamilyTimer` opens `accountm/2629_MoreInfo.xur`; `1003_IndividualDevice` btnY opens `music/1028_NowPlaying.xur` [census] | `installBladeInput` routes X/Y to nothing (app/main.ts:349-357); the glyphs are drawn | S to route `PressKey` 0x5802/0x5803 to the parked control's `PressPath`/state |
| B10 | `arcade/2504_TitleOptionsScene`, `250x_FriendsPlayingNowScene` (and 33 other scenes) | Games > Games Library > row > A | These scenes author `NavLeft`/`NavRight` (35 scenes in 6770; the README's "no control in the build sets NavLeft or NavRight" is false) | Left/Right always try a blade switch, refused while a page is open | S (route Left/Right through `FocusModel.move` first, fall back to the blade) |
| B11 | Console Settings row Themes | Console Settings > row 3 > A | Alt handler opens `Personalization.xur` [SPEC §3.6, INFER] | nothing; `Personalization.xur` is not in any pack | Honest gap in the ARCHIVE, not Live; keep as a placeholder, say so (PLACEHOLDERS lists it under option lists, not as a missing scene) |
| B12 | any code-filled list | Console Settings > Down | `btn_Focus.xma` once per move | the drive logs `btn_Focus` TWICE at the same tick on one Down inside a list (twice at tick 15 on Display); once on a nav-button page | S to check whether the row visual carries two emitters or the shell double-sets `Focus` |
| B13 | `memory/DeviceSelector`, `network/ConnStatus` | System > Memory / Network Settings | Device and network state [honest], but the pages' own chrome is authored: `ConnStatus` arrives focused on `scene_main` (5 list items, no nav chain the shell walks) | rows unreachable, A does nothing; not disclosed in `codeUnfilled` for ConnStatus | S to disclose; hardware to fill |

### NXE 9199

| # | scene | how you get there | console does | we do | size |
|---|---|---|---|---|---|
| N1 | 7 Console Settings sub-pages: `dashSysCslSetDisplay` (lstSettings, 7-row table at 0x927f0ae0), `Audio` (btnDigital, btnSoundEffects), `LangLocale` (btnLanguage, btnLocale), `Clock` (btnOption1-4), `StartupShutdown` (btnStartup, btnWelcome, btnAutoOff, btnBackgroundDownloads), `MediaAutoLaunch` (btnOn/btnOff), `RemoteC` (listChannels, 2 rows by code) | My Xbox > Settings > Console Settings > row > A | Each page has an authored NavUp/NavDown chain of `btn*` nav buttons with `PressPath`s (census §2 rows 61-68) or a code list; focus lands on the first, A pushes the child, the metapane and Current Setting follow [FRAME Kpa f0377-f0389 walks every row's Current Setting; Uc 1000-1200 s walks clock format and background downloads] | `fillLegacyPage` collects only `XuiNavButton`s whose Id starts with `nav`, so 7 pages arrive with `rows []`, `focusId null`, no metapane, `<setting>` painted; 15 child pages (`AudioDigital`, `Language`, `Country`, `ClockTime`... census rows 80-91), the 7 Display children and the whole Family Settings chain (`dashSysCslSetPControl` + 12 children, behind `PControlSelect.btnConsole`) are unreachable: 22 + 13 pages. Trap for the fix: `dashSysCslSetCountry.xur` exists in BOTH `consoles/` and `network/` in 9199, and `AssetIndex.findByBasename` returns null on a collision, so `LangLocale > Locale` will still refuse until the pack is named (the Blades rule "every basename is unique" is 6770-only) | M: reuse Blades' `FocusModel`/chain walk on hosted pages; wire `DISPLAY_ROWS_9199`; decode 9199's own Language/Country/TimeZone/RemoteC tables (the Blades `CODE_LISTS` are keyed by the same scene ids but carry 6770 VAs and row sets); set the row's `Press` state so `btn_Select` fires; then the option-select model of B1 |
| N2 | `<setting>` on the 7 pages above; `<#> of <Total #>` on `DeviceSelector`; and 45 more tokens on the 66 unmounted pages (`<MAC Addr>`, `<device name>`, `<servicename>` on `StartUp.btnIPTV`, four `<setting>`s on `PControlVideo`) waiting behind N1 | same | never painted [PLACEHOLDERS] | painted: no `discloseHardwareState` on the NXE route; the token gate covers `SystemScene` and `dashSysCslSet` only (Judge G R5 said one page). `back()` also never sets `legend_b` to `Press`, so `btn_Back` is silent on every page | S |
| N3 | Home: Gamer Card slot | My Xbox > Right > A | `KeyDown` A to the slot scene; with no profile the console opens the Sign In page `signin/SigninScene.xur` (a `MobyRootScene` with `Profile/CreateProfile/RecoverProfilePanelScene`) [SPEC §3 registration 0x922e2f34; FRAME Kpa 48-56 s, 96-112 in the sheet] | refused: "KeyDown is delivered to the slot scene, which has no handler in this archive" | M (the sign-in strip is a second Moby strip; its profile list is device state, empty and disclosed) |
| N4 | Home: Welcome channel slots Whats Hot, Xbox Basics; the five upsell channels' single slot | Up to Welcome > A; Up to Game Marketplace etc. > A | `EcNavToWhatsNew` -> `firstrun/WhatsNewRootScene.xur` (9 Rome panels), `EcNavToXboxBasics` -> `firstrun/XboxBasicsRootScene.xur` (8 panels), `EcNavToLiveUpsell` -> `homepage/LiveUpsellRootScene.xur` (5 panels): the root classes are registered against those files [SPEC §3, CODE 0x922eca74 / 0x922ec9e0 / 0x922c5044], the same standing `EcNavToSettings` was accepted on | refused as "not in the command table at 0x920288a0" (the names are not in the 35-entry table; the classes are) | L: needs the Rome CHANNEL (a `ColumnLayer` strip of `RomeDefaultSpacing` 480, `RomeInput*` physics, the `RomeOverlayScene` counter), which PLACEHOLDERS says the archive declares none of; it declares three |
| N5 | Home: Games Library, Video Library, Music Library, Picture Library, Windows Media Center | My Xbox > Right x2..6 > A | `EcNavToGamesLibrary` (id 3), `EcNavToVideoLibrary` (5), `EcNavToMusicLibrary` (0x17), `EcNavToPictureLibrary` (0x18), `EcNavToMediaCenter` (0x10); destinations materialised in code. The Yrt capture's "Collections 2 of 2" Rome panel [FRAME Yrt f0396, `arcade/CollectionFilterPanel.xur` under `arcade/ArcadeFilterScene` root] is the Games Library; `videos/FiltersRoot`, `music/1003_IndividualDevice`, `pictures/905_IndividualDeviceMain`, `dashcomm/742_SelectNetworkDevice` are the other four [INFER, by pack and the Blades chain] | refused, listed in `unboundCommands` | L: one disassembly read per handler (the work already done for id 4) plus N4's Rome strip; the device lists behind them are hardware |
| N6 | Home: Hide Welcome Channel | Up to Welcome > Right x3 > A | `EcHideWelcomeChannel`: sets the `EcoShowWelcomeChannel()` state false and rebuilds the queue without the channel (there is a `dashSysCslSetWelcomeChannel.xur` page for the same setting) [INFER] | refused | S (the shell already has the predicate as a switch) |
| N7 | `network/NetworkMain.xur` | Settings > Network Settings | Y "Status" is authored `Enabled=false` (offline); Configure Network -> `2004_NetworkDetails.xur` whose five `btn_*` rows open `2038_ConsoleInformation`, `2036_PPoESettings`, `2033_DNSConfig`, `WirelessSettings`, `2016_EditIPSettings` [census rows 99-103] | `2004_NetworkDetails` arrives dead (N1's `nav` filter); the three Test rows are code paths (honest: they need a network) | covered by N1 |
| N8 | `memory/DeviceSelector.xur` | Settings > Memory | Y "Device Options" (enabled); the device list is storage state [honest]. Legend shows Y [FRAME Yrt f0437] | Y drawn in the legend, Y does nothing; list empty and not disclosed in `legacy.filledFrom` | S to route X/Y (`PressKey` 0x5802/0x5803) and disclose the empty list |
| N9 | `dashcomm/742_SelectNetworkDevice.xur` (Computers) | Settings > Computers | `legend_x` is `Enabled=false` with a CRLF caption: no X entry on screen | the legend draws an `XButton` entry whose caption is `"\r\n"` (a blank glyph slot after B Back) | S (treat a whitespace caption as none, and honour `Enabled`) |
| N10 | any hosted page | Settings > Down | `KillFocus` on the row being left, `Focus` on the new one [Blades rule, `focusTo`] | `movePageFocus` sets `Focus` on the new row only; the previous row is never sent `KillFocus`. Not visually confirmed by this audit (the state probe returned nothing for these scopes); flagged | S to verify, S to fix |
| N11 | 9199 `dashSysCslSetAudio`, `ClockTime`, `WelcomeChannel` (and 32 more) | any hosted page | author `NavLeft`/`NavRight` | Left/Right are `movePanel`, refused while a page is open | S once N1 lands |
| N12 | Home: Disk in Tray, NXE Video | My Xbox > A; Welcome > Right x2 > A | eject (hardware); `EcPlayMigrationVideo` -> `homepage/VideoScene.xur` (`XuiVideo`, no file in the archive) | silent refusal | honest; say so in PLACEHOLDERS (neither is listed today) |
| N13 | Judge G residuals R1-R4 (name scroll 0.30 vs ~0.17 s, unfold on B 0.92 vs 0.67 s, rapid Ups collapse, legend Hide leads by ~0.27 s) | home | as measured in JUDGE.md | unchanged | S-M each, timing |

### Top ten, both dashboards, in the order a player hits them

1. N1 NXE Console Settings sub-pages are pictures (7 pages, 22 unreachable children).
2. B1 Blades option pages: A selects nothing (21 pages, 129 dead presses).
3. N3+N4+N5 NXE home: 16 of 17 slots do nothing on A; three destinations (Sign In, What's New, Xbox Basics) are in the archive and evidenced.
4. B2 Blades Media rows lead nowhere (MediaSourceSelection is in the dump).
5. N2+B5 Authoring tokens painted: 7 NXE pages, 2 Blades pages.
6. B3+B4 Create Gamer Profile and Initial Setup: two offline rows, two silent presses, both target scenes in the dump.
7. B7+B8 Empty lists whose contents are decoded or computable (three rating lists, five clock spinners).
8. B9+N8 X and Y are dead on both shells; "Device Options" is on screen on both.
9. B6 Display page's right pane empty (the Widescreen metapane is the frame's).
10. N9+N10+B12 small chrome bugs: CRLF legend entry, missing KillFocus, doubled btn_Focus.

---

## C. Honest placeholders: what cannot be closed offline

Not gaps. Each needs Live, a profile, a disc, hardware, or a file the
archive does not have.

| needs | Blades 6770 | NXE 9199 |
|---|---|---|
| Xbox LIVE | every Xbox LIVE and Marketplace blade row (Join, Recover Gamertag, Sign In, banner tile, the catalogue); `PControlSelect` Xbox LIVE Controls; `Games Library` sub-pages beyond the offline home (friends, leaderboards, downloads); the LIVE-served banner behind every `DefaultBanner` | the COMMUNITY channel; the Solutions slot (`SolutionsSlotScene.xur` is not in the pack either); the CONTENT of the five upsell panels beyond their own text; Games and Demos, Specialty Shops, Spotlight, the marketplace channels; themes and gamer pictures; `PControlLiveA/LiveC`'s effect |
| a profile | Sign Out; Family Timer durations (`lstTime`); the gamer card; Achievements / Played Games | the gamer card's data; the signed-in avatar; the sign-in page's profile rows (empty with none, which is the honest arrival state, not a reason to skip the page) |
| a disc | the tray caption (Open Tray is the chosen fall-through); Disk in Tray's A (eject) | same |
| hardware | HDTV mode list (native-mode row from EDID); AV pack and video mode; Live Vision camera; IPTV rows and pages; wireless; the storage device list; network tests and `ConnStatus`'s live status | same, plus `WirelessSettings`, PPPoE |
| the console clock | the VALUE the clock spinners are parked on (the ranges are not hardware) | the Clock row's Current Setting |
| not in the archive | the Xbox logo boot video; the guide (`xam.xex`); `Personalization.xur` (Themes); the blade skins `dashskn1/2` are theme overlays for a dash user | the boot video; the guide; `homepage/VideoScene.xur`'s video; `StorageUpsellSlotScene.xur`; `2002_NetworkConfigAction.xui` (a `.xui` name in `2036_PPoESettings`); the `.uxfx` pixel shaders; the avatar viewport camera |

---

## D. PLACEHOLDERS.md rows that are wrong or inflated

| row | verdict | why |
|---|---|---|
| "Second-level option lists: four of eleven still empty" | **inflated twice** | (1) The parental rating list CAN be filled: all 29 tables (184 rows) are decoded in `pcontrolSettings.ts`, and the locale that picks one is the same "United Kingdom" the file already accepts as a hardware-state row for the Locale line. (2) The clock spinners' RANGES are `sprintf` of decoded constants; only the parked value is device state. (3) "eleven" undercounts: the offline tree has 11 more code-driven lists with no table at all (`DeviceSelector#list_devices`, `MediaSourceSelection#listMediaSources`, `PControlVideoTV/Movie#lstRating`, `905#List`, three `music/*`, three `arcade/*`), and `ConnStatus` is not disclosed. |
| "The Current Setting values ... the tokens are CLEARED, never painted" (Blades) | **was false on 2 reached pages, then on 2 more; CLOSED in M3h** | `<device type>`, `<device connection string>`, `<device name>`, `<help text>` were painted on Computers and `<text>` on the Arcade home, because the clear ran before the metapane sub-scene and banner loaded (fixed in M3g). Judge E round 5 then found the deeper half of the same claim: the clear's regex was ANCHORED, so it only ever matched a Text that was NOTHING BUT one token. The corpus has 211 token controls, 192 whole and **19 carrying a token inside other text**, and all 19 were invisible to the fix AND to the detector that measured it - which is why round 4 could read "0 painted tokens on 447 screens" while `memory/DeviceSelector#labTotal` painted "<#> of <Total #>" and `arcade/2504_TitleOptionsScene#lblRatingText` painted three rating tokens. The rule is a SEARCH as of M3h, all 19 are named with the console rule that filled each (`TOKEN_SLOTS`), and the gate is a global search run over all 50 reached pages. See PLACEHOLDERS and JUDGE "Closed in M3h". |
| same row, "NXE 9199 ... the one token the shell reaches there, `navIPTVSettings`'s `<servicename>`" | **false** | `<setting>` is painted on 7 of the 8 Console Settings sub-pages the shell reaches by A. Judge G R5 counted one page and was told the gate covers two scenes; it is seven. |
| "Which `.xur` an `EcNavTo*` command opens ... Every other command is REFUSED ... no slot points anywhere plausible" | **inflated** | `EcNavToWhatsNew`, `EcNavToXboxBasics` and `EcNavToLiveUpsell` have destinations of exactly the standing `EcNavToSettings` was accepted on: the binary registers `CWhatsNewRootScene`, `CXboxBasicsRootScene` and `CUpsellRootScene` against `firstrun/WhatsNewRootScene.xur`, `firstrun/XboxBasicsRootScene.xur`, `homepage/LiveUpsellRootScene.xur` (NXE_GLUE_SPEC §3), and each root's panels are its pack siblings. The row should say "not built", not "not evidenced". |
| "The Rome CHANNEL ... the offline archive declares none" | **wrong** | The three Rome roots above ARE offline Rome channels (9, 8 and 5 panels), plus `arcade/ArcadeFilterScene` behind Games Library, which the Yrt capture shows as "Collections 2 of 2" [f0396] and the smoke suite already measures as a single panel. The counter has something to count. |
| "The gamer-card slot with no profile" | **incomplete** | Says what the slot shows, not what A does: `KeyDown` A opens `signin/SigninScene.xur` offline [FRAME Kpa 48-56 s]. The refusal message ("the slot scene has no handler in this archive") is not a placeholder reason; `CSigninScene` is registered at 0x922e2f34. |
| "The number of profiles on the console, and whether a disc is in the drive" | fine, but a row is missing | Disk in Tray's A (eject) and NXE Video's `EcPlayMigrationVideo` are silent refusals with no PLACEHOLDERS row. |
| "Themes (NXE)" / Blades Themes row | fine, misfiled | `Personalization.xur` is an ARCHIVE gap, and it sits inside the option-lists row; it deserves its own line beside the guide and the boot video. |
| "The guide", "The Xbox logo boot sequence", "`file://` image paths", "Sign Out", "Blade tabs at rest", the Aura/shader/texture-surface rows, the `...Ex` pair, the queue ramp, `Marker2`, the transition cues | fine | verified against the drive and the census; nothing to change. |

Also wrong, outside PLACEHOLDERS: README "no control in the build sets
NavLeft or NavRight" (35 scenes in 6770 and 35 in 9199 do, including
`arcade/2504_TitleOptionsScene` under Games Library and the 9199 Audio and
Clock pages); `displaySettings.ts:201, 277` "dashSysCslSetOutputLevels.xur is
not in this archive" (it is, and the Display row pushes it).

---

## E. What was and was not measured

- Blades driven route: `?build=6770&boot=none&manual&mute`, `seekRest` per
  blade, `move('Up')` to the head then `move('Down')` to the end, `press()`
  on every row, recursion to depth 5, `back()` with 60 stepped frames, then
  the eight real switch ranges, the tab lock inside a page, and every raw
  button through `__dashApi.press`. The boot route (`BootLive`) was checked
  separately: frame 462, LIVE blade, all seven containers filled, no errors.
- NXE driven route: `?build=9199&manual&mute`, every passing channel by
  `down()`/`up()` with 30-40 stepped frames, every panel by `right()`, `press()`
  with 160 stepped frames for the fold and the page, rows by `down()`, recursion,
  `back()` with 60 frames on a page and 320 on the last page.
- Cue evidence beyond the first 40 entries of a run was NOT trusted (the
  telemetry keeps the last 40); the cue claims above come from a second short
  probe and from the census of `File` keyframes. The exact cue sequence on
  the System > Console Settings > Display > Audio > Digital path is gated by
  `tests/smoke/smoke-nav.mjs` and was accepted by Judge E.
- NOT measured: pixel fidelity of any page beyond the ones the judges
  measured; the 8498 capture's selection behaviour (B1's pop rule); whether
  the NXE previous-row highlight really stays lit (N10); LB/RB on NXE (the
  console's behaviour is not in the specs); anything signed in.

---

## F. Corrections since this audit

- **2026-09-03 (M3h, Judge E round 5).** The Blades authoring-token row above
  counted what a detector could see, and the detector had the same blind spot
  as the code: an ANCHORED regex that matches only a Text which is nothing but
  one token. Over the 263 scenes, 211 controls carry a token and **19 of them
  carry it inside other text**; two are reachable offline and both were on
  screen. The rule, the walk's detector and the smoke gate are all a global
  search now, and `smoke-nav` §11 sweeps every one of the **50** reached pages:
  **0 painted tokens**. It also gates that no two visible controls paint at one
  authored design box - which caught `arcade/2504_TitleOptionsScene` drawing
  its MUA and MUB memory-unit glyphs on top of each other with no memory unit
  attached (all five indicators are the console's own `Show(x, flag)` block at
  0x9221c5e8 and are down with no title).
- **2026-09-03.** The 40-character authored-`Text` sweep quoted in JUDGE and
  LEARNINGS is **127**, not 126: `arcade/250x_EZPassScene` carries two controls
  called `lblInfo`, and a survey keyed by id loses one of them. The conclusion
  it supported - that `edInfo` is the only control whose prose belongs to
  another screen - is unchanged.

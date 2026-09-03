// Boot.
//
// Two separate things, and only the second is XUI.
//
// 1. The Xbox logo sequence is NOT in this archive. The whole 6770 asset set is
//    3,234 .xus, 295 PNG, 263 .xur, 16 .xma, 6 JPG, 5 .scb and one .ox - no
//    video container of any kind [SCENE, file-type census]. The PE's .XBMOVIE
//    section is 12 declared bytes of pointers into a Media Foundation property
//    key table (MFPKEY_Media_Conductor and friends) for music metadata, not a
//    movie [CODE]. The chrome sphere, the ignition flare, the ring of light and
//    the 5.08 s hold are rendered by the console's boot chain before dash.xex
//    runs. PLACEHOLDERS.md carries it; nothing here fakes it.
//
// 2. The dashboard's own boot-in IS in dashmain.xur. WhiteBootCover,
//    bootGradient, bootburst1..3, bootshadowLT/RT, WingBootLeft/RT and imgLogo
//    are Show=false at rest and animate only inside these ranges [SCENE]. The
//    unfurl measures 73 presented frames (f60 635..707, 1.22 s) against
//    BootLive's 71 authored frames - the strongest single confirmation of the
//    60 Hz clock.
//
// The dispatcher at 0x92111210-0x921115c8 reads the dash launch context from
// *(0x92803AB8), picks a pair and a 0-based target tab, jumps to the tab with
// 0x9214f068 and plays with 0x9214e370(hScene, start, start, end, 0, 0) -
// bRecurse = 0 here, unlike the panel ranges. The case bodies below are as
// read; the CONTEXT VALUE that selects each one is NOT recovered (the byte jump
// table at 0x92001FA0 does not resolve linearly onto the bodies), which is open
// question 1 in the spec. For the browser the honest default is BootLive.
export interface BootRange {
  name: string;
  end: string;
  /** 0-BASED, as the dispatcher stores it: 1 = Tab2 = Xbox LIVE. */
  tab: number;
  from: number;
  to: number;
}

/** Every boot/return pair the dispatcher can play, with the frames RootScene
 *  authors for it. The End frame is "End<Name>" here - the panel ranges use
 *  "<Name>End" instead, and both spellings are in the file. */
export const BOOT_RANGES: readonly BootRange[] = [
  { name: 'BootLive', end: 'EndBootLive', tab: 1, from: 462, to: 533 },
  { name: 'BootGames', end: 'EndBootGames', tab: 2, from: 534, to: 615 },
  { name: 'BootOOBE', end: 'EndBootOOBE', tab: 5, from: 616, to: 683 },
  { name: 'BootLiveCmd', end: 'EndBootLiveCmd', tab: 1, from: 830, to: 864 },
  { name: 'BootGamesCmd', end: 'EndBootGamesCmd', tab: 2, from: 865, to: 903 },
  { name: 'BootMediaCmd', end: 'EndBootMediaCmd', tab: 3, from: 904, to: 935 },
  { name: 'BootSystemCmd', end: 'EndBootSystemCmd', tab: 4, from: 936, to: 978 },
  { name: 'BootMarketplaceCmd', end: 'EndBootMarketplaceCmd', tab: 0, from: 979, to: 1019 },
  { name: 'ReturnGames', end: 'EndReturnGames', tab: 2, from: 1020, to: 1055 },
  { name: 'ReturnMedia', end: 'EndReturnMedia', tab: 3, from: 1056, to: 1089 },
  { name: 'BootSystem', end: 'EndBootSystem', tab: 4, from: 1090, to: 1140 },
  { name: 'ReturnSystem', end: 'EndReturnSystem', tab: 4, from: 1141, to: 1179 },
  { name: 'ReturnLive', end: 'EndReturnLive', tab: 1, from: 1180, to: 1216 },
  { name: 'ReturnMarketplace', end: 'EndReturnMarketplace', tab: 0, from: 1217, to: 1252 },
  { name: 'BootMarketplace', end: 'EndBootMarketplace', tab: 0, from: 1253, to: 1298 },
];

/** Cold boot with no launch argument and no OOBE pending lands on Xbox LIVE,
 *  which is also DefaultTab 2 and what the footage shows [FRAME f60 705]. */
export const DEFAULT_BOOT = 'BootLive';

/**
 * The frame the console hands over on. There is nothing before BootLive inside
 * XUI: the logo sequence ends with a three-frame hard cut to black in the boot
 * capture (video frames 579-581) and the unfurl starts at 582, so the first
 * XUI frame of the session is this range's own opening frame.
 */
export const BOOT_HANDOVER_FRAME = 462;

/** The cue the range fires out of its own timeline, for the smoke gate:
 *  _2ndLevel_Sounds plays dash_2ndLevelClose.xma on frame 497 inside BootLive. */
export const BOOT_CUES: Readonly<Record<string, { frame: number; cue: string }[]>> = {
  BootLive: [{ frame: 497, cue: 'dash_2ndLevelClose' }],
  BootGames: [{ frame: 534, cue: 'dash_3rdLevelClose' }, { frame: 581, cue: 'dash_2ndLevelClose' }],
};

export const SETTING_KEYS: [string, string][] = [
  ["mmlKey", "Maanmittauslaitoksen API-avain"],
  ["lantmaterietUsername", "Lantmäteriet sähköposti (Topowebb)"],
  ["lantmaterietPassword", "Lantmäteriet salasana (Topowebb)"],
  ["owmKey", "OpenWeatherMap API-avain"],
];

export const SETTING_TOGGLES: [string, string][] = [
  ["showWgs", "WGS84-koordinaatit"],
  ["showEtrs", "ETRS-TM35FIN-koordinaatit"],
  ["showElev", "Maaston korkeus"],
  ["showWeather", "Paikallissää"],
  ["showCenterCrosshair", "Näytä keskikohdan osoitin"],
  ["tileCache", "Käytä karttalaattojen välimuistia"],
  ["showLayerErrors", "Näytä karttatason virheilmoitukset"],
  ["showZoomControls", "Näytä +/- zoom-painikkeet"],
];

export const SETTING_VALUE_KEYS = [
  "dataFetchMode",
  "crosshairColor",
  "measurementUnits",
  "measurementType",
  "theme",
  "uiOverlayOpacity",
] as const;

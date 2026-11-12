# Karttasovellus (Tauri v2 + React + OpenLayers)

## Esivaatimukset (Windows 10/11)
1. **Microsoft C++ Build Tools** (Visual Studio Installer → "Desktop development with C++")
2. **Rust**: https://rustup.rs (valitse MSVC-toolchain)
3. **Node.js 18+**
4. **WebView2** (Windows 11:ssa valmiina)

## Käynnistys
```
npm install
npx tauri icon app-icon.png     # luo src-tauri/icons (vaihda halutessasi oma 1024x1024 PNG)
npm run tauri dev               # kehitystila (ensimmäinen Rust-käännös kestää useita minuutteja)
npm run tauri build             # asennuspaketti: src-tauri/target/release/bundle/
```
`npm run dev` käynnistää pelkän frontendin selaimessa (localhost:1420) – SQLite ja paikalliset kartat toimivat vain Taurissa.

## API-avaimet (Asetukset-ikoni oikeassa yläkulmassa)
- Maanmittauslaitos: https://www.maanmittauslaitos.fi/rajapinnat/api-avaimen-ohje
- Lantmäteriet Topo: Lantmäteriet-käyttäjän sähköposti ja salasana
- OpenWeatherMap: openweathermap.org/api

API-avaimet ja Lantmäteriet-tunnukset tallennetaan Windowsin suojattuun
käyttöjärjestelmän tunnussäilöön, eivät sovelluksen SQLite-tietokantaan.

## Frontendin rakenne

Frontend on jaettu ominaisuuksien ja integraatioiden mukaan:

- `src/app` sisältää sovelluksen rungon, työkalupalkin ja yleiset dialogit.
- `src/features/map` sisältää karttanäkymän, OpenLayers-integraation ja kartan tyylit.
- `src/features/map/catalog` sisältää pohjakarttojen ja overlay-tasojen katalogit.
- `src/features/measurements` sisältää mittausten muotoilun, viennin ja korkeusprofiilin.
- `src/features/location-info` sisältää koordinaatti-, korkeus- ja säätiedot.
- `src/features/settings` sisältää asetustyypit ja oletusasetukset.
- `src/infrastructure/tauri` sisältää Tauri-, tile-, asetus- ja feature-rajapinnat.
- `src/shared` sisältää ulkoisista ominaisuuksista riippumattomat yhteiset apurit.

`src/infrastructure/tauriBridge.ts` säilyy toistaiseksi yhteensopivuusfasadina,
jotta ominaisuudet voidaan siirtää pienempiin bridge-tiedostoihin vaiheittain.

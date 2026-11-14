# API-avaimet ja Googlen karttatasojen käyttöönotto

Tässä ohjeessa kuvataan, miten Avokartasto-sovelluksen ulkoiset API-avaimet määritetään ja miten valmiit Google-karttatasopohjat otetaan käyttöön.

---

## 1. API-avainten ja tunnusten asettaminen sovelluksessa

1. Avaa sovelluksen oikean yläkulman työkalupalkista **Asetukset** (ratasikoni).
2. Avaa osio **API-avaimet ja tunnukset**.
3. Syötä tarvittavat avaimet ja tallenna asetukset. Avaimet tallennetaan paikallisesti sovelluksen asetustietokantaan.

---

## 2. Tuetut API-avaimet ja niiden hankinta

### Maanmittauslaitoksen API-avain (`mmlKey`)
- **Mihin vaikuttaa:** MML Maastokartta, MML Taustakartta, MML Selkokartta, MML Ortokuva sekä muut Maanmittauslaitoksen WMTS-pohjaiset tasot.
- **Käyttöönotto:**
  1. Rekisteröidy / kirjaudu Maanmittauslaitoksen palveluun: [https://www.maanmittauslaitos.fi/rajapinnat/api-avaimen-ohje](https://www.maanmittauslaitos.fi/rajapinnat/api-avaimen-ohje).
  2. Luo maksuton API-avain (WMTS / Karttakuvapalvelu).
  3. Liitä saamasi avain asetusten kenttään **Maanmittauslaitoksen API-avain**.

---

### Lantmäteriet Topowebb (`lantmaterietUsername` ja `lantmaterietPassword`)
- **Mihin vaikuttaa:** Ruotsin **Lantmäteriet Topo** -pohjakartta (Basic Auth -tunnistautuminen).
- **Käyttöönotto:**
  1. Luo maksuton CC-BY-tili Lantmäterietin Geotorget-palvelussa: [https://geotorget.lantmateriet.se/](https://geotorget.lantmateriet.se/).
  2. Tilaa / aktivoi **Topowebb Visning (CC-BY)** -rajapinta.
  3. Syötä tilisi sähköpostiosoite ja salasana asetusten kenttiin **Lantmäteriet sähköposti (Topowebb)** ja **Lantmäteriet salasana (Topowebb)**.

---

### OpenWeatherMap API-avain (`owmKey`)
- **Mihin vaikuttaa:** Kartan paikallissää- ja sääennustenäkymä sekä OpenWeatherMap-sääkarttatasot (päällyskartat).
- **Käyttöönotto:**
  1. Rekisteröidy OpenWeatherMap-palveluun: [https://openweathermap.org/api](https://openweathermap.org/api).
  2. Luo API-avain (*My API Keys*). Huomaa, että uuden avaimen aktivoituminen voi kestää muutamasta minuutista muutamaan tuntiin.
  3. Liitä avain asetusten kenttään **OpenWeatherMap API-avain**.

---

### Copernicus Data Space Instance ID (`copernicusInstanceId`)
- **Mihin vaikuttaa:** **Copernicus Sentinel-2 (Satelliitti)** -karttataso sekä kartan alareunan päivämäärä-, pilvisyys- ja kaistavalitsin.
- **Käyttöönotto:**
  1. Luo maksuton tili Copernicus Data Space Ecosystem -palvelussa: [https://dataspace.copernicus.eu/](https://dataspace.copernicus.eu/).
  2. Kirjaudu sisään **Copernicus Browser / Configuration Utility** -näkymään ([https://shapps.dataspace.copernicus.eu/dashboard/](https://shapps.dataspace.copernicus.eu/dashboard/)).
  3. Luo uusi **Configuration** (Sentinel-2 L2A -pohjalla) ja kopioi sen **Instance ID** (UUID-muotoinen tunnus).
  4. Liitä tunnus asetusten kenttään **Copernicus Data Space Instance ID**.

---

## 3. Googlen karttatasojen käyttöönotto

Sovelluksessa on valmiina neljä Google-karttatasopohjaa ilman oletus-URL-osoitetta:

| Karttataso | Tyyppi | Rooli |
| :--- | :--- | :--- |
| **Google Satelliitti** | `Tile Map API` (`xyz`) | Pohjakartta |
| **Google Hybridi** | `Tile Map API` (`xyz`) | Pohjakartta |
| **Google Maasto** | `Tile Map API` (`xyz`) | Pohjakartta |
| **Google Tiet & paikannimet** | `Tile Map API` (`xyz`) | Päällyskartta |

### Miksi URL-osoite on oletuksena tyhjä?
Googlen karttatiilien suoraan osoitteeseen perustuva käyttö ilman virallista Google Maps Platform -istuntoa ei ole tuettu oletuksena. Tämän vuoksi tasot toimitetaan tyhjinä pohjina, joihin käyttäjä voi liittää oman laillisen XYZ-tiiliosoitteen.

### Käyttöönotto vaihe vaiheelta
1. Avaa vasemman yläkulman **Karttatasot**-paneeli.
2. Klikkaa haluamasi Google-tason kohdalla olevaa valikkoa (hiiren oikea painike tai `...`).
3. Valitse **Muokkaa**.
4. Syötä **Tiilipalvelun URL** -kenttään oma XYZ-muotoinen tiiliosoite, jossa on `{x}`, `{y}` ja `{z}` -paikkamerkit (esimerkiksi oman Google Map Tiles API -välityspalvelimesi URL):
   ```text
   https://oma-tiilipalvelu.example/tiles/{z}/{x}/{y}.png
   ```
   Jos käytät Google Maps Platformin **Map Tiles API** -rajapintaa:
   - Luo API-avain Google Cloud Consolessa ja ota käyttöön **Map Tiles API**.
   - Luo istuntotunniste (`POST https://tile.googleapis.com/v1/createSession?key=API_AVAIN`) valitulla `mapType`-asetuksella (`satellite`, `roadmap` tai `terrain`).
   - Osoitteen muoto session-tunnisteella on:
     ```text
     https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=SESSION_TOKEN&key=API_AVAIN
     ```
   *(Huom. Google Map Tiles API:n `session`-tunniste vanhenee 2 viikon välein, joten pysyvään käyttöön suositellaan omaa pientä välityspalvelinta, joka uusii session automaattisesti.)*
5. Paina **Tallenna**.

### Oletustason palauttaminen
Jos haluat tyhjentää tekemäsi muutokset Google-pohjasta, avaa tason valikko ja valitse **Palauta oletus**.

---

## 4. Oman karttatason lisääminen API-avaimella

Jos lisäät kokonaan uuden karttatason **Karttatasot -> `+`** -valikosta (`Tile Map API`, `WMS API`, `WMTS API` jne.), voit halutessasi viitata asetuksiin tallennettuihin API-avaimiin suoraan URL-osoitteessa käyttämällä `{secret:avain}`-syntaksia, esimerkiksi:

- `{secret:mmlKey}`
- `{secret:owmKey}`
- `{secret:copernicusInstanceId}`

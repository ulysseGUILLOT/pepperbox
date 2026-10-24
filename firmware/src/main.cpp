// Capteur de climat de la box : lit la temperature et l'humidite d'un SHT
// et les affiche sur le port serie, avec l'etat du Wi-Fi et du serveur.
// Envoie au serveur, une fois par minute, un battement qui porte la derniere
// mesure. Se met a jour par le Wi-Fi (OTA).
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <SHTSensor.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

#include <memory>

#if !__has_include("secrets.h")
#error "include/secrets.h manquant : copier include/secrets.example.h"
#endif
#include "secrets.h"
#ifndef OTA_PASSWORD
#error "OTA_PASSWORD manquant dans include/secrets.h : voir include/secrets.example.h"
#endif

// Ecrit par version.py avant chaque compilation.
#if __has_include("version.h")
#include "version.h"
#else
#define FIRMWARE_VERSION "inconnue"
#endif

// Broches I2C par defaut de l'ESP32-S3 dans le core Arduino.
constexpr int PIN_SDA = 8;
constexpr int PIN_SCL = 9;
constexpr unsigned long READ_INTERVAL_MS = 5000;

// Plage visee : celle de croissance du guide de culture
// (frontend/src/views/Guide.jsx), lampe allumee. Une seule plage, jour et
// nuit, sans dependre du serveur ni de l'etat de la lampe.
// Reprises par la carte du simulateur (simulator/app/board.py) : a modifier
// ensemble.
constexpr float TEMP_COLD_C = 22.0;
constexpr float TEMP_HOT_C = 28.0;
// Pour l'affichage serie (bon, trop froid, trop chaud) : une temperature qui
// oscille autour d'une borne ne bascule pas a chaque mesure.
constexpr float TEMP_HYSTERESIS_C = 0.5;

// LED RGB WS2812 de la DevKitC-1, sur GPIO 48 (RGB_BUILTIN). Intensite basse :
// elle reste allumee toute la nuit dans la box, donc dans l'appartement.
constexpr uint8_t LED_LEVEL = 16;
// Degrade : vert pur au milieu de la plage, moitie-moitie a une borne, puis
// couleur pure TEMP_GRADIENT_C plus loin -- rouge franc a 31 °C, bleu franc a
// 19 °C. La somme des composantes reste LED_LEVEL : meme luminosite partout.
constexpr float TEMP_GRADIENT_C = 3.0;
// En dessous, la LED ne change pas : le bruit de mesure ne la fait pas
// scintiller d'une teinte a sa voisine.
constexpr float LED_STEP_C = 0.2;

// Meme adresse que le tableau de bord : depuis le LAN, le retour de boucle
// NAT de la Freebox fait passer la carte par Apache, qui l'accepte comme
// n'importe quel appareil du reseau local. Une minute entre deux battements :
// chacun est une ligne dans les journaux de production, et le serveur ne
// declare la carte hors ligne qu'apres trois manques (BOX_TIMEOUT).
constexpr const char *HEARTBEAT_URL = "https://pepperbox.ulysseguillot.fr/api/box/heartbeat";
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 60000;

// Nom annonce en mDNS pour la mise a jour par le Wi-Fi : pepperbox-box.local.
constexpr const char *OTA_HOSTNAME = "pepperbox-box";

// Racines de Let's Encrypt. Chaine servie le 2026-10-24 : YE1 -> Root YE ->
// ISRG Root X2 -> ISRG Root X1, les deux derniers maillons en signatures
// croisees. mbedTLS s'arrete au premier certificat de confiance rencontre :
// X2 ou X1 suffit tant que le serveur envoie ces signatures croisees. S'il
// cesse de le faire, ajouter ici ISRG Root YE (letsencrypt.org/certificates).
const char *LETSENCRYPT_ROOTS = R"(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----
)";

// Detection automatique du modele : le code ne depend pas du SHT soude sur la
// carte. L'objet est recree a chaque essai, car une detection ratee le laisse
// fige sur le dernier modele essaye ; les essais suivants ne testeraient
// plus que celui-la.
std::unique_ptr<SHTSensor> sht;
bool sensorReady = false;

enum class Climate { Unknown, Cold, Good, Hot };
Climate climate = Climate::Unknown;
// Temperature affichee par la LED ; NAN quand elle est eteinte.
float ledTemperature = NAN;

// Derniere mesure, envoyee avec le battement ; NAN sans capteur.
float lastTemperature = NAN;
float lastHumidity = NAN;
unsigned long lastReadMs = 0;

WiFiClientSecure tls;
// Dernier code HTTP du battement, ou erreur negative de HTTPClient.
int serverStatus = 0;
bool heartbeatDue = true;
unsigned long lastHeartbeatMs = 0;

// L'OTA ne demarre qu'une fois le Wi-Fi connecte : mDNS a besoin d'une
// adresse pour s'annoncer.
bool otaStarted = false;
int otaLastTenth = -1;

// Seuls les types que la detection automatique peut renvoyer. SHTC1 couvre
// aussi le SHTC3 et les SHTW, qui partagent son protocole.
const char *sensorName(SHTSensor::SHTSensorType type) {
  switch (type) {
    case SHTSensor::SHT4X: return "SHT4x";
    case SHTSensor::SHT2X: return "SHT2x";
    case SHTSensor::SHT3X: return "SHT3x";
    case SHTSensor::SHT3X_ALT: return "SHT3x (adresse 0x45)";
    case SHTSensor::SHTC1: return "SHTC1/SHTC3";
    default: return "inconnu";
  }
}

Climate classify(float celsius, Climate previous) {
  if (previous == Climate::Cold && celsius < TEMP_COLD_C + TEMP_HYSTERESIS_C) return Climate::Cold;
  if (previous == Climate::Hot && celsius > TEMP_HOT_C - TEMP_HYSTERESIS_C) return Climate::Hot;
  if (celsius < TEMP_COLD_C) return Climate::Cold;
  if (celsius > TEMP_HOT_C) return Climate::Hot;
  return Climate::Good;
}

const char *climateName(Climate c) {
  switch (c) {
    case Climate::Cold: return "trop froid";
    case Climate::Good: return "bon";
    case Climate::Hot: return "trop chaud";
    default: return "inconnu";
  }
}

// Couleur de la LED pour une temperature, NAN eteinte : une couleur figee
// mentirait sur la temperature. Le vert cede au rouge vers le chaud, au bleu
// vers le froid.
void showTemperature(float celsius) {
  ledTemperature = celsius;
  if (isnan(celsius)) {
    neopixelWrite(RGB_BUILTIN, 0, 0, 0);
    return;
  }
  const float center = (TEMP_COLD_C + TEMP_HOT_C) / 2;
  const float reach = (TEMP_HOT_C - TEMP_COLD_C) / 2 + TEMP_GRADIENT_C;
  const float x = constrain((celsius - center) / reach, -1.0f, 1.0f);
  const uint8_t mix = lroundf(fabsf(x) * LED_LEVEL);
  const uint8_t green = LED_LEVEL - mix;
  if (x >= 0) {
    neopixelWrite(RGB_BUILTIN, mix, green, 0);
  } else {
    neopixelWrite(RGB_BUILTIN, 0, green, mix);
  }
}

// L'adresse est envoyee par la carte : celle que voit le serveur est celle
// du retour de boucle NAT, commune a tout le LAN.
// Sans mesure, null : le serveur garde la carte en ligne sans rien historiser.
void jsonNumber(char *out, size_t size, float value, const char *format) {
  if (isnan(value)) {
    snprintf(out, size, "null");
  } else {
    snprintf(out, size, format, value);
  }
}

void sendHeartbeat() {
  char temperature[12];
  char humidity[12];
  jsonNumber(temperature, sizeof temperature, lastTemperature, "%.2f");
  jsonNumber(humidity, sizeof humidity, lastHumidity, "%.1f");

  char body[224];
  snprintf(body, sizeof body,
           R"({"ip":"%s","rssi_dbm":%d,"uptime_s":%lu,)"
           R"("temperature_c":%s,"humidity_pct":%s,"firmware":"%s"})",
           WiFi.localIP().toString().c_str(), WiFi.RSSI(), millis() / 1000,
           temperature, humidity, FIRMWARE_VERSION);

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  if (http.begin(tls, HEARTBEAT_URL)) {
    http.addHeader("Content-Type", "application/json");
    serverStatus = http.POST(body);
  } else {
    serverStatus = HTTPC_ERROR_CONNECTION_REFUSED;
  }
  http.end();
}

void printServer() {
  if (serverStatus == HTTP_CODE_OK) {
    Serial.print("  serveur ok");
  } else if (serverStatus > 0) {
    // 403 : Apache n'a pas reconnu la carte comme etant du reseau local.
    Serial.printf("  serveur HTTP %d", serverStatus);
  } else {
    Serial.printf("  serveur injoignable (%s)", HTTPClient::errorToString(serverStatus).c_str());
  }
}

// Mise a jour par le Wi-Fi : espota (pio run -e esp32s3-ota -t upload, ou
// ota.ps1) envoie le binaire, ecrit dans l'emplacement d'application qui ne
// tourne pas ; la carte bascule dessus au redemarrage. Une coupure en cours
// de route laisse l'ancien firmware en place.
void startOta() {
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  ArduinoOTA.setPassword(OTA_PASSWORD);
  ArduinoOTA.onStart([]() {
    // Blanche le temps de l'ecriture : la carte ne mesure plus rien.
    neopixelWrite(RGB_BUILTIN, LED_LEVEL, LED_LEVEL, LED_LEVEL);
    otaLastTenth = -1;
    Serial.println("mise a jour : reception du firmware");
  });
  ArduinoOTA.onProgress([](unsigned int done, unsigned int total) {
    int tenth = done * 10 / total;
    if (tenth != otaLastTenth) {
      otaLastTenth = tenth;
      Serial.printf("mise a jour : %d %%\n", tenth * 10);
    }
  });
  ArduinoOTA.onEnd([]() { Serial.println("mise a jour : terminee, redemarrage"); });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("mise a jour : echec (%u)\n", error);
    // Eteinte : la mesure suivante la rallume a la bonne couleur.
    showTemperature(NAN);
  });
  ArduinoOTA.begin();
  otaStarted = true;
  Serial.printf("mise a jour par le Wi-Fi prete : %s.local, firmware %s\n", OTA_HOSTNAME,
                FIRMWARE_VERSION);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);

  // Tout le degrade au demarrage, du bleu au rouge en passant par le vert :
  // verifie la LED sans attendre une mesure. La WS2812 garde sa derniere
  // couleur a travers un redemarrage de la carte, d'ou l'extinction finale.
  const float sweepFrom = TEMP_COLD_C - TEMP_GRADIENT_C;
  const float sweepTo = TEMP_HOT_C + TEMP_GRADIENT_C;
  for (int i = 0; i <= 40; i++) {
    showTemperature(sweepFrom + (sweepTo - sweepFrom) * i / 40);
    delay(30);
  }
  showTemperature(NAN);

  tls.setCACert(LETSENCRYPT_ROOTS);
  tls.setHandshakeTimeout(10);

  // Le core reconnecte seul apres une coupure du point d'acces.
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// La boucle ne dort plus cinq secondes d'un bloc : une demande de mise a
// jour doit etre servie sans attendre la mesure suivante.
void loop() {
  if (otaStarted) ArduinoOTA.handle();
  if (millis() - lastReadMs < READ_INTERVAL_MS && lastReadMs != 0) {
    delay(10);
    return;
  }
  lastReadMs = millis();

  if (!otaStarted && WiFi.status() == WL_CONNECTED) startOta();

  // Retente la detection a chaque tour : un capteur branche apres le
  // demarrage, ou rebranche, est pris en compte sans redemarrer la carte.
  if (!sensorReady) {
    sht.reset(new SHTSensor());
    sensorReady = sht->init(Wire);
    if (sensorReady) {
      Serial.printf("capteur detecte : %s\n", sensorName(sht->getSensorType()));
    }
  }

  Climate next = Climate::Unknown;
  if (sensorReady && sht->readSample()) {
    lastTemperature = sht->getTemperature();
    // En air sature, le SHT peut annoncer un peu plus de 100 % : le serveur
    // refuserait tout le battement.
    lastHumidity = constrain(sht->getHumidity(), 0.0f, 100.0f);
    next = classify(lastTemperature, climate);
    Serial.printf("%.1f °C %s  %.1f %%HR", lastTemperature, climateName(next), lastHumidity);
  } else {
    sensorReady = false;
    lastTemperature = NAN;
    lastHumidity = NAN;
    Serial.print("capteur introuvable : verifier le cablage SDA/SCL");
  }
  climate = next;
  // Allumee ou eteinte : toujours. Teinte : seulement au-dela d'un pas.
  if (isnan(lastTemperature) != isnan(ledTemperature)
      || fabsf(lastTemperature - ledTemperature) >= LED_STEP_C) {
    showTemperature(lastTemperature);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("  wifi %s %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (heartbeatDue || millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
      sendHeartbeat();
      lastHeartbeatMs = millis();
      heartbeatDue = false;
    }
    printServer();
    Serial.println();
  } else {
    // Battement immediat au retour du Wi-Fi, sans attendre la minute.
    heartbeatDue = true;
    Serial.println("  wifi deconnecte");
  }
}

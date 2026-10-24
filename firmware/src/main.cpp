// Capteur de climat de la box : lit la temperature et l'humidite d'un SHT
// et les affiche sur le port serie, avec l'etat du Wi-Fi et du serveur.
#include <Arduino.h>
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

// Broches I2C par defaut de l'ESP32-S3 dans le core Arduino.
constexpr int PIN_SDA = 8;
constexpr int PIN_SCL = 9;
constexpr unsigned long READ_INTERVAL_MS = 5000;

// Meme adresse que le tableau de bord : depuis le LAN, le retour de boucle
// NAT de la Freebox fait passer la carte par Apache, qui l'accepte comme
// n'importe quel appareil du reseau local. Une minute entre deux appels :
// chaque appel est une ligne dans les journaux de production.
constexpr const char *HEALTH_URL = "https://pepperbox.ulysseguillot.fr/api/health";
constexpr unsigned long PING_INTERVAL_MS = 60000;

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

WiFiClientSecure tls;
// Dernier code HTTP de /api/health, ou erreur negative de HTTPClient.
int serverStatus = 0;
bool pingDue = true;
unsigned long lastPingMs = 0;

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

void pingServer() {
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  serverStatus = http.begin(tls, HEALTH_URL) ? http.GET() : HTTPC_ERROR_CONNECTION_REFUSED;
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

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);

  tls.setCACert(LETSENCRYPT_ROOTS);
  tls.setHandshakeTimeout(10);

  // Le core reconnecte seul apres une coupure du point d'acces.
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  // Retente la detection a chaque tour : un capteur branche apres le
  // demarrage, ou rebranche, est pris en compte sans redemarrer la carte.
  if (!sensorReady) {
    sht.reset(new SHTSensor());
    sensorReady = sht->init(Wire);
    if (sensorReady) {
      Serial.printf("capteur detecte : %s\n", sensorName(sht->getSensorType()));
    }
  }

  if (sensorReady && sht->readSample()) {
    Serial.printf("%.1f °C  %.1f %%HR", sht->getTemperature(), sht->getHumidity());
  } else {
    sensorReady = false;
    Serial.print("capteur introuvable : verifier le cablage SDA/SCL");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("  wifi %s %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (pingDue || millis() - lastPingMs >= PING_INTERVAL_MS) {
      pingServer();
      lastPingMs = millis();
      pingDue = false;
    }
    printServer();
    Serial.println();
  } else {
    // Appel immediat au retour du Wi-Fi, sans attendre la minute.
    pingDue = true;
    Serial.println("  wifi deconnecte");
  }

  delay(READ_INTERVAL_MS);
}

// Arduino UNO Logic Interpreter
// A0,A1 = saidas digitais auxiliares
// A2,A3 = entradas analogicas
// A4,A5 = I2C (SDA, SCL) para Display LCD
// D1-D6 = entradas digitais
// D7 = S1 (DHT22 original) + AM2302 (S3=temp, S4=umidade)
// D8 = S2 (DS18B20 original) + DS18B20 adicional (S5=temp)
// D9,D10 = saidas PWM
// D11-D13 = saidas digitais
//
// Mapeamento de Sensores:
// S1 = DHT22 original (D7) - temp/umidade
// S2 = DS18B20 original (D8) - temperatura
// S3 = AM2302 temperatura (D7)
// S4 = AM2302 umidade (D7)
// S5 = DS18B20 temperatura (D8)
// S6-S8 = reserva para sensores I2C futuros
//
// Display I2C:
// Comando: Itexto:variavel
// Exemplo: Ivalor:S1T (mostra "valor" na linha 1 e temperatura S1 na linha 2)
// Uso: D5&&D6Ivalor:S1T (quando D5 E D6 estão ativos, mostra no display)

#include <EEPROM.h>

#if defined(__has_include)
  #if __has_include(<DHT.h>)
    #include <DHT.h>
    #define HAS_DHT_LIB 1
  #else
    #define HAS_DHT_LIB 0
  #endif

  #if __has_include(<OneWire.h>) && __has_include(<DallasTemperature.h>)
    #include <OneWire.h>
    #include <DallasTemperature.h>
    #define HAS_DS18B20_LIB 1
  #else
    #define HAS_DS18B20_LIB 0
  #endif

  #if __has_include(<Wire.h>) && __has_include(<LiquidCrystal_I2C.h>)
    #include <Wire.h>
    #include <LiquidCrystal_I2C.h>
    #define HAS_LCD_I2C_LIB 1
  #else
    #define HAS_LCD_I2C_LIB 0
  #endif
#else
  #include <DHT.h>
  #include <OneWire.h>
  #include <DallasTemperature.h>
  #include <Wire.h>
  #include <LiquidCrystal_I2C.h>
  #define HAS_DHT_LIB 1
  #define HAS_DS18B20_LIB 1
  #define HAS_LCD_I2C_LIB 1
#endif

#define MAX_CODE_SIZE 256
#define MAX_TIMERS 5
#define MAX_COUNTERS 5
#define MAX_AND_CONDITIONS 10
#define MAX_OR_CONDITIONS 10
#define MAX_VIRTUAL_VARS 10
#define MAX_LINES 10
#define MAX_SENSORS 8
#define EEPROM_CODE_ADDR 0
#define SENSOR_READ_INTERVAL_MS 2000UL

const int A01 = A0;
const int A02 = A1;
const int A03 = A2;
const int A04 = A3;
const int D01 = 1;
const int D02 = 2;
const int D03 = 3;
const int D04 = 4;
const int D05 = 5;
const int D06 = 6;
const int D07 = 7;
const int D08 = 8;
const int D09 = 9;
const int D010 = 10;
const int D011 = 11;
const int D012 = 12;
const int D013 = 13;

byte outmode = 0;

byte outputA0 = 0;
byte outputA1 = 0;
byte outputD9 = 0;
byte outputD10 = 0;
byte outputD11 = 0;
byte outputD12 = 0;
byte outputD13 = 0;

byte desiredA0 = 0;
byte desiredA1 = 0;
byte desiredD9 = 0;
byte desiredD10 = 0;
byte desiredD11 = 0;
byte desiredD12 = 0;
byte desiredD13 = 0;
byte desiredVirtual[MAX_VIRTUAL_VARS];

byte digitalInputState[6] = {0};
int analogInputState[2] = {0};
byte virtualVars[MAX_VIRTUAL_VARS] = {0};

unsigned long timerStart[MAX_TIMERS] = {0};
unsigned long timerDuration[MAX_TIMERS] = {0};
bool timerActive[MAX_TIMERS] = {false};
bool timerState[MAX_TIMERS] = {false};

int counterValue[MAX_COUNTERS] = {0};
int counterTarget[MAX_COUNTERS] = {0};
bool counterTrigger[MAX_COUNTERS] = {false};
bool counterLastTrigger[MAX_COUNTERS] = {false};

byte sensorOnline[MAX_SENSORS] = {0};
float sensorTemperature[MAX_SENSORS] = {0};
float sensorHumidity[MAX_SENSORS] = {0};
unsigned long lastSensorReadMs = 0;

char codeBuffer[MAX_CODE_SIZE];
int codeLength = 0;
bool codeReady = false;

struct CodeLine {
  int start;
  int end;
};

CodeLine codeLines[MAX_LINES];
int numLines = 0;
String serialBuffer = "";

#if HAS_DHT_LIB
DHT sensorS1(D07, DHT22);
#endif

#if HAS_DS18B20_LIB
OneWire sensorBusS2(D08);
DallasTemperature sensorS2(&sensorBusS2);
#endif

#if HAS_LCD_I2C_LIB
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdInitialized = false;
bool lcdFound = false;
uint8_t lcdAddr = 0x27;
char lcdLine0[17] = {'\0'};
char lcdLine1[17] = {'\0'};
bool lcdShowing = false;
bool lcdActiveThisCycle = false;
#endif

void setup();
void loop();
void processSerial();
void processCommand(String cmd);
void prepareCodeLines();
void resetRuntimeState();
void updateProcessImage(bool forceSensorRead = false);
void updateSensorStates(bool forceRead = false);
void updateTimers();
void applyOutputs();
void executeLogic();
void executeLine(int lineIndex);
bool evaluateOrCondition(int &pos, int endPos);
bool evaluateSingleCondition(int &pos, int endPos);
bool readInput(int &pos, int endPos);
bool evaluateMath(int &pos, int endPos, bool notFlag);
float evaluateMathExpression(int &pos, int endPos);
void processOutput(int &pos, int endPos, bool conditionResult);
void printStatus();
void printSensorFloat(float value);
void loadCodeFromEEPROM();
void saveCodeToEEPROM();
void setPort(String port);
void setOutput(int pin, int value);
void setPWM(int pin, int value);
void setVirtualVar(int num, int value);
void displayMessage(String text, String variable);
String getVariableValue(String variable);
int readNumber(int &pos, int endPos);
float readFloatNumber(int &pos, int endPos);
bool readComparisonOperator(int &pos, int endPos, char &op);
bool compareValues(float left, char op, float right);
float getAnalogValueByIndex(int pin);
float getSensorValue(int sensorIndex, char channel);
int getPinNumber(int logicalPin);

void setup() {
  digitalWrite(A01, HIGH);
  digitalWrite(A02, HIGH);
  digitalWrite(D011, HIGH);
  digitalWrite(D012, HIGH);
  digitalWrite(D013, HIGH);

  pinMode(A01, OUTPUT);
  pinMode(A02, OUTPUT);
  pinMode(D09, OUTPUT);
  pinMode(D010, OUTPUT);
  pinMode(D011, OUTPUT);
  pinMode(D012, OUTPUT);
  pinMode(D013, OUTPUT);

  pinMode(D01, INPUT);
  pinMode(D02, INPUT);
  pinMode(D03, INPUT);
  pinMode(D04, INPUT);
  pinMode(D05, INPUT);
  pinMode(D06, INPUT);

  pinMode(A03, INPUT);
  pinMode(A04, INPUT);

  analogWrite(D09, 0);
  analogWrite(D010, 0);

  Serial.begin(9600);

#if HAS_DHT_LIB
  sensorS1.begin();
#endif

#if HAS_DS18B20_LIB
  sensorS2.begin();
#endif

#if HAS_LCD_I2C_LIB
  Wire.begin();
  delay(500);

  lcdFound = false;
  lcdAddr = 0x27;

  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) {
    lcdAddr = 0x27;
    lcdFound = true;
  } else {
    Wire.beginTransmission(0x3F);
    if (Wire.endTransmission() == 0) {
      lcdAddr = 0x3F;
      lcdFound = true;
    } else {
      lcdAddr = 0x27;
      lcdFound = true;
    }
  }

  if (lcdAddr != 0x27) {
    lcd = LiquidCrystal_I2C(lcdAddr, 16, 2);
  }
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdInitialized = true;
  Serial.print(F("LCD:OK(0x"));
  Serial.print(lcdAddr, HEX);
  Serial.println(F(")"));
#endif

  resetRuntimeState();
  loadCodeFromEEPROM();
  updateProcessImage(true);
  applyOutputs();

#if HAS_LCD_I2C_LIB
  if (lcdInitialized) {
    lcd.setCursor(0, 0);
    lcd.print("Arduino Logic");
    lcd.setCursor(0, 1);
    lcd.print("Ready!");
  }
#endif

  Serial.println(F("READY"));
}

void loop() {
  processSerial();
  updateProcessImage();
  updateTimers();

  if (codeReady) {
    executeLogic();
  }

  applyOutputs();
}

void processSerial() {
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        processCommand(serialBuffer);
        serialBuffer = "";
      }
    } else {
      serialBuffer += c;
    }
  }
}

void processCommand(String cmd) {
  cmd.trim();

  if (cmd.startsWith("CODE:")) {
    String code = cmd.substring(5);
    code.trim();
    codeLength = min((int) code.length(), MAX_CODE_SIZE - 1);
    code.toCharArray(codeBuffer, codeLength + 1);
    resetRuntimeState();
    prepareCodeLines();
    codeReady = codeLength > 0;
    saveCodeToEEPROM();
    Serial.println(F("CODE:OK"));
    return;
  }

  if (cmd == "STATUS") {
    printStatus();
    return;
  }

  if (cmd.startsWith("SET:")) {
    setPort(cmd.substring(4));
    return;
  }

  if (cmd == "OUTMODE:LOW") {
    outmode = 0;
    Serial.println(F("OUTMODE:LOW"));
    return;
  }

  if (cmd == "OUTMODE:HIGH") {
    outmode = 1;
    Serial.println(F("OUTMODE:HIGH"));
    return;
  }

  if (cmd.startsWith("SETV")) {
    int eqPos = cmd.indexOf('=');
    if (eqPos > 4) {
      int varNum = cmd.substring(4, eqPos).toInt();
      int value = cmd.substring(eqPos + 1).toInt();
      setVirtualVar(varNum, value);
    }
  }
}

void prepareCodeLines() {
  numLines = 0;

  if (codeLength <= 0) {
    codeBuffer[0] = '\0';
    return;
  }

  int lineStart = 0;

  for (int i = 0; i < codeLength && numLines < MAX_LINES; i++) {
    if (codeBuffer[i] == ';') {
      codeLines[numLines].start = lineStart;
      codeLines[numLines].end = i;
      numLines++;
      lineStart = i + 1;
    }
  }

  if (lineStart < codeLength && numLines < MAX_LINES) {
    codeLines[numLines].start = lineStart;
    codeLines[numLines].end = codeLength;
    numLines++;
  }
}

void resetRuntimeState() {
  outputA0 = 0;
  outputA1 = 0;
  outputD9 = 0;
  outputD10 = 0;
  outputD11 = 0;
  outputD12 = 0;
  outputD13 = 0;

  desiredA0 = 0;
  desiredA1 = 0;
  desiredD9 = 0;
  desiredD10 = 0;
  desiredD11 = 0;
  desiredD12 = 0;
  desiredD13 = 0;
  memset(desiredVirtual, 0, sizeof(desiredVirtual));

  for (int i = 0; i < MAX_TIMERS; i++) {
    timerStart[i] = 0;
    timerDuration[i] = 0;
    timerActive[i] = false;
    timerState[i] = false;
  }

  for (int i = 0; i < MAX_COUNTERS; i++) {
    counterValue[i] = 0;
    counterTarget[i] = 0;
    counterTrigger[i] = false;
    counterLastTrigger[i] = false;
  }

  for (int i = 0; i < MAX_VIRTUAL_VARS; i++) {
    virtualVars[i] = 0;
  }
}

void updateProcessImage(bool forceSensorRead) {
  digitalInputState[0] = digitalRead(D01);
  digitalInputState[1] = digitalRead(D02);
  digitalInputState[2] = digitalRead(D03);
  digitalInputState[3] = digitalRead(D04);
  digitalInputState[4] = digitalRead(D05);
  digitalInputState[5] = digitalRead(D06);

  analogInputState[0] = analogRead(A03);
  analogInputState[1] = analogRead(A04);

  updateSensorStates(forceSensorRead);
}

void updateSensorStates(bool forceRead) {
  unsigned long now = millis();
  if (!forceRead && (now - lastSensorReadMs) < SENSOR_READ_INTERVAL_MS) {
    return;
  }

  lastSensorReadMs = now;

  // S1 e S2 - sensores originais (mantidos para compatibilidade)
#if HAS_DHT_LIB
  float s1Temp = sensorS1.readTemperature();
  float s1Hum = sensorS1.readHumidity();
  if (!isnan(s1Temp) && !isnan(s1Hum)) {
    sensorOnline[0] = 1;
    sensorTemperature[0] = s1Temp;
    sensorHumidity[0] = s1Hum;
  } else {
    sensorOnline[0] = 0;
    sensorTemperature[0] = 0;
    sensorHumidity[0] = 0;
  }
#else
  sensorOnline[0] = 0;
  sensorTemperature[0] = 0;
  sensorHumidity[0] = 0;
#endif

#if HAS_DS18B20_LIB
  sensorS2.requestTemperatures();
  float s2Temp = sensorS2.getTempCByIndex(0);
  if (s2Temp > -126.0) {
    sensorOnline[1] = 1;
    sensorTemperature[1] = s2Temp;
    sensorHumidity[1] = 0;
  } else {
    sensorOnline[1] = 0;
    sensorTemperature[1] = 0;
    sensorHumidity[1] = 0;
  }
#else
  sensorOnline[1] = 0;
  sensorTemperature[1] = 0;
  sensorHumidity[1] = 0;
#endif

  // S3 (temp) e S4 (umidade) - reutiliza leitura do S1 (mesmo sensor D7)
#if HAS_DHT_LIB
  if (!isnan(s1Temp)) {
    sensorOnline[2] = 1;
    sensorTemperature[2] = s1Temp;
    sensorHumidity[2] = 0;
  } else {
    sensorOnline[2] = 0;
    sensorTemperature[2] = 0;
    sensorHumidity[2] = 0;
  }
  if (!isnan(s1Hum)) {
    sensorOnline[3] = 1;
    sensorTemperature[3] = 0;
    sensorHumidity[3] = s1Hum;
  } else {
    sensorOnline[3] = 0;
    sensorTemperature[3] = 0;
    sensorHumidity[3] = 0;
  }
#else
  sensorOnline[2] = 0;
  sensorTemperature[2] = 0;
  sensorHumidity[2] = 0;
  sensorOnline[3] = 0;
  sensorTemperature[3] = 0;
  sensorHumidity[3] = 0;
#endif

  // S5 - DS18B20 no D8 - reutiliza leitura do S2 (mesmo barramento)
#if HAS_DS18B20_LIB
  if (s2Temp > -126.0) {
    sensorOnline[4] = 1;
    sensorTemperature[4] = s2Temp;
    sensorHumidity[4] = 0;
  } else {
    sensorOnline[4] = 0;
    sensorTemperature[4] = 0;
    sensorHumidity[4] = 0;
  }
#else
  sensorOnline[4] = 0;
  sensorTemperature[4] = 0;
  sensorHumidity[4] = 0;
#endif

  // S6, S7, S8 - reserva (I2C A4/A5)
  for (int i = 5; i < 8; i++) {
    sensorOnline[i] = 0;
    sensorTemperature[i] = 0;
    sensorHumidity[i] = 0;
  }
}

void updateTimers() {
  unsigned long now = millis();

  for (int i = 0; i < MAX_TIMERS; i++) {
    if (timerActive[i] && timerDuration[i] > 0) {
      if (now - timerStart[i] >= timerDuration[i]) {
        timerState[i] = true;
      }
    }
  }
}

void applyOutputs() {
  digitalWrite(A01, outputA0 == outmode ? HIGH : LOW);
  digitalWrite(A02, outputA1 == outmode ? HIGH : LOW);
  digitalWrite(D011, outputD11 == outmode ? HIGH : LOW);
  digitalWrite(D012, outputD12 == outmode ? HIGH : LOW);
  digitalWrite(D013, outputD13 == outmode ? HIGH : LOW);
  analogWrite(D09, outputD9);
  analogWrite(D010, outputD10);
}

void executeLogic() {
  desiredA0 = 0;
  desiredA1 = 0;
  desiredD9 = 0;
  desiredD10 = 0;
  desiredD11 = 0;
  desiredD12 = 0;
  desiredD13 = 0;
  memset(desiredVirtual, 0, sizeof(desiredVirtual));
#if HAS_LCD_I2C_LIB
  lcdActiveThisCycle = false;
#endif

  for (int i = 0; i < MAX_COUNTERS; i++) {
    counterTrigger[i] = false;
  }

  for (int line = 0; line < numLines; line++) {
    executeLine(line);
  }

  outputA0 = desiredA0;
  outputA1 = desiredA1;
  outputD11 = desiredD11;
  outputD12 = desiredD12;
  outputD13 = desiredD13;

  if (desiredD9 > 0) outputD9 = desiredD9;
  else outputD9 = 0;
  if (desiredD10 > 0) outputD10 = desiredD10;
  else outputD10 = 0;

  for (int i = 0; i < MAX_VIRTUAL_VARS; i++) {
    if (desiredVirtual[i]) {
      virtualVars[i] = 1;
    }
  }

  for (int i = 0; i < MAX_COUNTERS; i++) {
    if (counterTrigger[i] && !counterLastTrigger[i]) {
      counterValue[i]++;
    }
    counterLastTrigger[i] = counterTrigger[i];
  }

#if HAS_LCD_I2C_LIB
  if (!lcdActiveThisCycle && lcdShowing && lcdInitialized) {
    lcd.clear();
    lcdLine0[0] = '\0';
    lcdLine1[0] = '\0';
    lcdShowing = false;
  }
#endif
}

void executeLine(int lineIndex) {
  int pos = codeLines[lineIndex].start;
  int endPos = codeLines[lineIndex].end;
  bool andResult = true;
  int andCount = 0;

  while (pos < endPos && andCount < MAX_AND_CONDITIONS) {
    bool orResult = evaluateOrCondition(pos, endPos);
    if (!orResult) {
      andResult = false;
      break;
    }

    andCount++;

    if (pos + 1 < endPos && codeBuffer[pos] == '&' && codeBuffer[pos + 1] == '&') {
      pos += 2;
    } else {
      break;
    }
  }

  processOutput(pos, endPos, andResult);
}

bool evaluateOrCondition(int &pos, int endPos) {
  bool orResult = false;
  int orCount = 0;

  while (pos < endPos && orCount < MAX_OR_CONDITIONS) {
    if (evaluateSingleCondition(pos, endPos)) {
      orResult = true;
    }

    orCount++;

    if (pos + 1 < endPos && codeBuffer[pos] == 'O' && codeBuffer[pos + 1] == 'R') {
      pos += 2;
    } else {
      break;
    }
  }

  return orResult;
}

bool evaluateSingleCondition(int &pos, int endPos) {
  bool notFlag = false;

  if (pos < endPos && codeBuffer[pos] == '!') {
    notFlag = true;
    pos++;
  }

  if (pos < endPos && codeBuffer[pos] == '(') {
    pos++;
    bool value = evaluateOrCondition(pos, endPos);
    if (pos < endPos && codeBuffer[pos] == ')') {
      pos++;
    }
    return notFlag ? !value : value;
  }

  if (pos < endPos && codeBuffer[pos] == 'M') {
    return evaluateMath(pos, endPos, notFlag);
  }

  bool value = readInput(pos, endPos);
  return notFlag ? !value : value;
}

bool readInput(int &pos, int endPos) {
  if (pos >= endPos) return false;

  char type = codeBuffer[pos++];

  if (type == 'D') {
    int pin = readNumber(pos, endPos);

    if (pin >= 1 && pin <= 6) return digitalInputState[pin - 1] == 1;
    if (pin == 9) return outputD9 > 0;
    if (pin == 10) return outputD10 > 0;
    if (pin == 11) return outputD11 == 1;
    if (pin == 12) return outputD12 == 1;
    if (pin == 13) return outputD13 == 1;
    return false;
  }

  if (type == 'A') {
    int pin = readNumber(pos, endPos);

    if (pin == 0) return outputA0 == 1;
    if (pin == 1) return outputA1 == 1;

    float value = getAnalogValueByIndex(pin);
    if (pin != 2 && pin != 3) return false;

    char op = 0;
    if (readComparisonOperator(pos, endPos, op)) {
      float compareValue = readFloatNumber(pos, endPos);
      return compareValues(value, op, compareValue);
    }

    return value > 0;
  }

  if (type == 'S') {
    int num = readNumber(pos, endPos);
    if (num < 1 || num > MAX_SENSORS) return false;

    char channel = 0;
    if (pos < endPos && isAlpha(codeBuffer[pos])) {
      channel = codeBuffer[pos++];
    }

    if (channel == 0) {
      return sensorOnline[num - 1] == 1;
    }

    float sensorValue = getSensorValue(num - 1, channel);
    char op = 0;
    if (readComparisonOperator(pos, endPos, op)) {
      float compareValue = readFloatNumber(pos, endPos);
      return sensorOnline[num - 1] == 1 && compareValues(sensorValue, op, compareValue);
    }

    return sensorOnline[num - 1] == 1 && sensorValue != 0;
  }

  if (type == 'T') {
    int num = readNumber(pos, endPos);
    if (num < 1 || num > MAX_TIMERS) return false;

    if (pos < endPos && codeBuffer[pos] == '=') {
      pos++;
      unsigned long targetTime = (unsigned long) readNumber(pos, endPos);
      timerDuration[num - 1] = targetTime;
      if (!timerActive[num - 1]) return false;
      return (millis() - timerStart[num - 1]) >= targetTime;
    }

    return timerActive[num - 1];
  }

  if (type == 'C') {
    int num = readNumber(pos, endPos);
    if (num < 1 || num > MAX_COUNTERS) return false;

    if (pos < endPos && codeBuffer[pos] == '=') {
      pos++;
      int target = readNumber(pos, endPos);
      counterTarget[num - 1] = target;
      return counterValue[num - 1] >= target;
    }

    return counterValue[num - 1] > 0;
  }

  if (type == 'V') {
    int num = readNumber(pos, endPos);
    if (num >= 1 && num <= MAX_VIRTUAL_VARS) {
      return virtualVars[num - 1] == 1;
    }
  }

  if (type == 'I') {
    pos--;
    return true;
  }

  return false;
}

bool evaluateMath(int &pos, int endPos, bool notFlag) {
  pos++;
  if (pos < endPos && codeBuffer[pos] == '(') {
    pos++;
  }

  float result = evaluateMathExpression(pos, endPos);

  if (pos < endPos && codeBuffer[pos] == ')') {
    pos++;
  }

  char op = 0;
  if (readComparisonOperator(pos, endPos, op)) {
    float compareValue = readFloatNumber(pos, endPos);
    bool compareResult = compareValues(result, op, compareValue);
    return notFlag ? !compareResult : compareResult;
  }

  return false;
}

float evaluateMathExpression(int &pos, int endPos) {
  float result = 0;
  char op = '+';
  bool firstValue = true;

  while (pos < endPos && codeBuffer[pos] != ')') {
    float value = 0;
    bool hasValue = false;

    if (codeBuffer[pos] == '(') {
      pos++;
      value = evaluateMathExpression(pos, endPos);
      if (pos < endPos && codeBuffer[pos] == ')') pos++;
      hasValue = true;
    } else if (codeBuffer[pos] == 'A') {
      pos++;
      int pin = readNumber(pos, endPos);
      value = getAnalogValueByIndex(pin);
      hasValue = true;
    } else if (codeBuffer[pos] == 'S') {
      pos++;
      int sensorIndex = readNumber(pos, endPos) - 1;
      char channel = 'T';
      if (pos < endPos && isAlpha(codeBuffer[pos])) {
        channel = codeBuffer[pos++];
      }
      value = getSensorValue(sensorIndex, channel);
      hasValue = true;
    } else if (codeBuffer[pos] == '-' || isDigit(codeBuffer[pos])) {
      value = readFloatNumber(pos, endPos);
      hasValue = true;
    }

    if (hasValue) {
      if (firstValue) {
        result = value;
        firstValue = false;
      } else {
        if (op == '+') result += value;
        else if (op == '-') result -= value;
        else if (op == '*') result *= value;
        else if (op == '/') result = value != 0 ? result / value : 0;
      }
      continue;
    }

    if (codeBuffer[pos] == '+' || codeBuffer[pos] == '-' || codeBuffer[pos] == '*' || codeBuffer[pos] == '/') {
      op = codeBuffer[pos++];
    } else {
      pos++;
    }
  }

  return result;
}

void processOutput(int &pos, int endPos, bool conditionResult) {
  while (pos < endPos) {
    char type = codeBuffer[pos];

    if (type == 'I') {
      // Comando para display I2C: Itexto:variavel
      pos++; // pula o 'I'
      
      // Lê o texto até encontrar ':'
      String displayText = "";
      while (pos < endPos && codeBuffer[pos] != ':') {
        displayText += codeBuffer[pos];
        pos++;
      }
      
      if (pos < endPos && codeBuffer[pos] == ':') {
        pos++; // pula o ':'
        
        // Lê a variável
        String variable = "";
        while (pos < endPos && codeBuffer[pos] != ' ' && codeBuffer[pos] != ';') {
          variable += codeBuffer[pos];
          pos++;
        }
        
        if (conditionResult) {
          displayMessage(displayText, variable);
        }
      }
      continue;
    }

    if (type == 'A') {
      pos++;
      int pin = readNumber(pos, endPos);

      if (pin == 0 || pin == 1) {
        if (pos < endPos && codeBuffer[pos] == '=') {
          pos++;
          int value = readNumber(pos, endPos);
          if (conditionResult && value > 0) {
            if (pin == 0) desiredA0 = 1;
            else desiredA1 = 1;
          }
        } else {
          if (conditionResult) {
            if (pin == 0) desiredA0 = 1;
            else desiredA1 = 1;
          }
        }
        continue;
      }

      if (pos < endPos && codeBuffer[pos] == '=') {
        pos++;
        if (pos < endPos && codeBuffer[pos] == 'D') {
          pos++;
          int pwmPin = readNumber(pos, endPos);
          if (pos < endPos && codeBuffer[pos] == '(') {
            pos++;
            int minVal = (int) readFloatNumber(pos, endPos);
            if (pos < endPos && codeBuffer[pos] == ',') pos++;
            int maxVal = (int) readFloatNumber(pos, endPos);
            if (pos < endPos && codeBuffer[pos] == ')') pos++;

            if (conditionResult) {
              int rawValue = (int) getAnalogValueByIndex(pin);
              int limitedMin = min(minVal, maxVal);
              int limitedMax = max(minVal, maxVal);
              int pwmValue = map(constrain(rawValue, limitedMin, limitedMax), limitedMin, limitedMax, 0, 255);
              if (pwmPin == 9 && pwmValue > desiredD9) desiredD9 = pwmValue;
              if (pwmPin == 10 && pwmValue > desiredD10) desiredD10 = pwmValue;
            }
          }
        }
      }
      continue;
    }

    if (type == 'D') {
      pos++;
      int pin = readNumber(pos, endPos);

      if (pos < endPos && codeBuffer[pos] == '=') {
        pos++;
        int value = readNumber(pos, endPos);
        if (conditionResult && value > 0) {
          if (pin == 9 && value > desiredD9) desiredD9 = value;
          else if (pin == 10 && value > desiredD10) desiredD10 = value;
          else if (pin == 11) desiredD11 = 1;
          else if (pin == 12) desiredD12 = 1;
          else if (pin == 13) desiredD13 = 1;
        }
      } else {
        if (conditionResult) {
          if (pin == 9) desiredD9 = 255;
          else if (pin == 10) desiredD10 = 255;
          else if (pin == 11) desiredD11 = 1;
          else if (pin == 12) desiredD12 = 1;
          else if (pin == 13) desiredD13 = 1;
        }
      }
      continue;
    }

    if (type == 'V') {
      pos++;
      int num = readNumber(pos, endPos);
      if (conditionResult && num >= 1 && num <= MAX_VIRTUAL_VARS) {
        desiredVirtual[num - 1] = 1;
      }
      continue;
    }

    if (type == 'T') {
      pos++;
      int num = readNumber(pos, endPos);
      if (num < 1 || num > MAX_TIMERS) continue;

      if (pos < endPos && codeBuffer[pos] == 'R') {
        pos++;
        if (conditionResult) {
          timerActive[num - 1] = false;
          timerState[num - 1] = false;
          timerStart[num - 1] = 0;
        }
      } else if (pos < endPos && codeBuffer[pos] == '=') {
        pos++;
        timerDuration[num - 1] = (unsigned long) readNumber(pos, endPos);
      } else if (conditionResult && !timerActive[num - 1]) {
        timerStart[num - 1] = millis();
        timerActive[num - 1] = true;
        timerState[num - 1] = false;
      }
      continue;
    }

    if (type == 'C') {
      pos++;
      int num = readNumber(pos, endPos);
      if (num < 1 || num > MAX_COUNTERS) continue;

      if (pos < endPos && codeBuffer[pos] == 'R') {
        pos++;
        if (conditionResult) {
          counterValue[num - 1] = 0;
          counterLastTrigger[num - 1] = false;
        }
      } else if (pos < endPos && codeBuffer[pos] == '=') {
        pos++;
        counterTarget[num - 1] = readNumber(pos, endPos);
      } else if (conditionResult) {
        counterTrigger[num - 1] = true;
      }
      continue;
    }

    pos++;
  }
}

void printStatus() {
  Serial.print(F("OUTMODE:"));
  Serial.println(outmode == 0 ? "LOW" : "HIGH");

  Serial.print(F("A0:"));
  Serial.print(outputA0);
  Serial.print(F(" A1:"));
  Serial.print(outputA1);
  Serial.print(F(" A2:"));
  Serial.print(analogInputState[0]);
  Serial.print(F(" A3:"));
  Serial.println(analogInputState[1]);

  Serial.print(F("D1:"));
  Serial.print(digitalInputState[0]);
  Serial.print(F(" D2:"));
  Serial.print(digitalInputState[1]);
  Serial.print(F(" D3:"));
  Serial.print(digitalInputState[2]);
  Serial.print(F(" D4:"));
  Serial.print(digitalInputState[3]);
  Serial.print(F(" D5:"));
  Serial.print(digitalInputState[4]);
  Serial.print(F(" D6:"));
  Serial.println(digitalInputState[5]);

  for (int i = 0; i < MAX_SENSORS; i++) {
    Serial.print(F("S"));
    Serial.print(i + 1);
    Serial.print(F(":"));
    Serial.print(sensorOnline[i]);
    Serial.print(F(" S"));
    Serial.print(i + 1);
    Serial.print(F("T:"));
    printSensorFloat(sensorTemperature[i]);
    Serial.print(F(" S"));
    Serial.print(i + 1);
    Serial.print(F("H:"));
    printSensorFloat(sensorHumidity[i]);
    Serial.print(F(" "));
  }
  Serial.println();

  Serial.print(F("D9:"));
  Serial.print(outputD9);
  Serial.print(F(" D10:"));
  Serial.print(outputD10);
  Serial.print(F(" D11:"));
  Serial.print(outputD11);
  Serial.print(F(" D12:"));
  Serial.print(outputD12);
  Serial.print(F(" D13:"));
  Serial.println(outputD13);

  for (int i = 0; i < MAX_VIRTUAL_VARS; i++) {
    Serial.print(F("V"));
    Serial.print(i + 1);
    Serial.print(F(":"));
    Serial.print(virtualVars[i]);
    Serial.print(F(" "));
  }
  Serial.println();

  for (int i = 0; i < MAX_TIMERS; i++) {
    Serial.print(F("T"));
    Serial.print(i + 1);
    Serial.print(F(":"));
    Serial.print(timerState[i] ? 1 : 0);
    Serial.print(F("/"));
    Serial.print(timerDuration[i]);
    Serial.print(F(" "));
  }
  Serial.println();

  for (int i = 0; i < MAX_COUNTERS; i++) {
    Serial.print(F("C"));
    Serial.print(i + 1);
    Serial.print(F(":"));
    Serial.print(counterValue[i]);
    Serial.print(F("/"));
    Serial.print(counterTarget[i]);
    Serial.print(F(" "));
  }
  Serial.println();
}

void printSensorFloat(float value) {
  Serial.print(value, 1);
}

void loadCodeFromEEPROM() {
  int storedLength = EEPROM.read(EEPROM_CODE_ADDR);
  if (storedLength <= 0 || storedLength == 255) {
    codeLength = 0;
    codeReady = false;
    codeBuffer[0] = '\0';
    return;
  }

  codeLength = min(storedLength, MAX_CODE_SIZE - 1);
  for (int i = 0; i < codeLength; i++) {
    codeBuffer[i] = EEPROM.read(EEPROM_CODE_ADDR + 1 + i);
  }
  codeBuffer[codeLength] = '\0';
  prepareCodeLines();
  codeReady = codeLength > 0;
}

void saveCodeToEEPROM() {
  EEPROM.write(EEPROM_CODE_ADDR, codeLength);
  for (int i = 0; i < codeLength; i++) {
    EEPROM.write(EEPROM_CODE_ADDR + 1 + i, codeBuffer[i]);
  }
}

void setPort(String port) {
  port.trim();

  if (port == "A0") setOutput(0, 1);
  else if (port == "A1") setOutput(1, 1);
  else if (port == "D9") setPWM(9, 255);
  else if (port == "D10") setPWM(10, 255);
  else if (port == "D11") setOutput(11, 1);
  else if (port == "D12") setOutput(12, 1);
  else if (port == "D13") setOutput(13, 1);
}

void setOutput(int pin, int value) {
  if (pin == 0) outputA0 = value ? 1 : 0;
  else if (pin == 1) outputA1 = value ? 1 : 0;
  else if (pin == 9) outputD9 = value ? 255 : 0;
  else if (pin == 10) outputD10 = value ? 255 : 0;
  else if (pin == 11) outputD11 = value ? 1 : 0;
  else if (pin == 12) outputD12 = value ? 1 : 0;
  else if (pin == 13) outputD13 = value ? 1 : 0;
}

void setPWM(int pin, int value) {
  if (pin == 9) outputD9 = constrain(value, 0, 255);
  else if (pin == 10) outputD10 = constrain(value, 0, 255);
}

void setVirtualVar(int num, int value) {
  if (num >= 1 && num <= MAX_VIRTUAL_VARS) {
    virtualVars[num - 1] = value ? 1 : 0;
  }
}

int readNumber(int &pos, int endPos) {
  int number = 0;
  while (pos < endPos && isDigit(codeBuffer[pos])) {
    number = (number * 10) + (codeBuffer[pos] - '0');
    pos++;
  }
  return number;
}

float readFloatNumber(int &pos, int endPos) {
  char buffer[24];
  int index = 0;

  if (pos < endPos && codeBuffer[pos] == '-') {
    buffer[index++] = codeBuffer[pos++];
  }

  while (pos < endPos && (isDigit(codeBuffer[pos]) || codeBuffer[pos] == '.')) {
    if (index < 23) {
      buffer[index++] = codeBuffer[pos];
    }
    pos++;
  }

  buffer[index] = '\0';
  return atof(buffer);
}

bool readComparisonOperator(int &pos, int endPos, char &op) {
  if (pos >= endPos) return false;

  char token = codeBuffer[pos];
  if (token != '>' && token != '<' && token != '=') return false;

  op = token;
  pos++;
  if (pos < endPos && codeBuffer[pos] == '=') {
    pos++;
  }
  return true;
}

bool compareValues(float left, char op, float right) {
  if (op == '>') return left >= right;
  if (op == '<') return left <= right;
  return left == right;
}

float getAnalogValueByIndex(int pin) {
  if (pin == 2) return analogInputState[0];
  if (pin == 3) return analogInputState[1];
  return 0;
}

float getSensorValue(int sensorIndex, char channel) {
  if (sensorIndex < 0 || sensorIndex >= MAX_SENSORS) return 0;
  if (channel == 'H') return sensorHumidity[sensorIndex];
  if (channel == 'P') return 0;
  return sensorTemperature[sensorIndex];
}

int getPinNumber(int logicalPin) {
  switch (logicalPin) {
    case 1: return D01;
    case 2: return D02;
    case 3: return D03;
    case 4: return D04;
    case 5: return D05;
    case 6: return D06;
    default: return D02;
  }
}

void displayMessage(String text, String variable) {
#if HAS_LCD_I2C_LIB
  if (!lcdInitialized || !lcdFound) return;

  lcdActiveThisCycle = true;

  if (text.length() > 16) text = text.substring(0, 16);
  while (text.length() < 16) text += ' ';

  String value = getVariableValue(variable);
  if (value.length() > 16) value = value.substring(0, 16);
  while (value.length() < 16) value += ' ';

  char newLine0[17];
  char newLine1[17];
  text.toCharArray(newLine0, 17);
  value.toCharArray(newLine1, 17);

  if (memcmp(newLine0, lcdLine0, 16) != 0) {
    memcpy(lcdLine0, newLine0, 17);
    lcd.setCursor(0, 0);
    lcd.print(lcdLine0);
  }
  if (memcmp(newLine1, lcdLine1, 16) != 0) {
    memcpy(lcdLine1, newLine1, 17);
    lcd.setCursor(0, 1);
    lcd.print(lcdLine1);
  }
  lcdShowing = true;
#endif
}

String getVariableValue(String variable) {
  variable.trim();
  
  if (variable.startsWith("A")) {
    int pin = variable.substring(1).toInt();
    if (pin == 0) return String(outputA0);
    if (pin == 1) return String(outputA1);
    if (pin == 2) return String(analogInputState[0]);
    if (pin == 3) return String(analogInputState[1]);
    return "0";
  }
  
  if (variable.startsWith("D")) {
    int pin = variable.substring(1).toInt();
    if (pin >= 1 && pin <= 6) return String(digitalInputState[pin - 1]);
    if (pin == 9) return String(outputD9);
    if (pin == 10) return String(outputD10);
    if (pin == 11) return String(outputD11);
    if (pin == 12) return String(outputD12);
    if (pin == 13) return String(outputD13);
    return "0";
  }
  
  if (variable.startsWith("S")) {
    String sensorStr = variable.substring(1);
    int sensorNum = 0;
    char channel = 'T';
    
    // Extrai número do sensor
    int i = 0;
    while (i < sensorStr.length() && isDigit(sensorStr[i])) {
      sensorNum = sensorNum * 10 + (sensorStr[i] - '0');
      i++;
    }
    
    // Extrai canal se existir
    if (i < sensorStr.length()) {
      channel = sensorStr[i];
    }
    
    if (sensorNum >= 1 && sensorNum <= MAX_SENSORS) {
      int index = sensorNum - 1;
      if (sensorOnline[index]) {
        if (channel == 'H') return String(sensorHumidity[index], 1);
        if (channel == 'P') return "0";
        return String(sensorTemperature[index], 1);
      }
    }
    return "OFF";
  }
  
  if (variable.startsWith("V")) {
    int num = variable.substring(1).toInt();
    if (num >= 1 && num <= MAX_VIRTUAL_VARS) {
      return String(virtualVars[num - 1]);
    }
    return "0";
  }
  
  if (variable.startsWith("T")) {
    int num = variable.substring(1).toInt();
    if (num >= 1 && num <= MAX_TIMERS) {
      return String(timerState[num - 1] ? 1 : 0);
    }
    return "0";
  }
  
  if (variable.startsWith("C")) {
    int num = variable.substring(1).toInt();
    if (num >= 1 && num <= MAX_COUNTERS) {
      return String(counterValue[num - 1]);
    }
    return "0";
  }
  
  return variable; // Retorna o texto original se não for uma variável conhecida
}

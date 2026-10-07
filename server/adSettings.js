const fs = require('fs');
const path = require('path');

const slots = ['hero', 'sidebar', 'footer', 'chat_banner', 'chat_sidebar'];
function validateAdSettings(body) {
  if (Object.hasOwn(body, 'adsEnabled') && typeof body.adsEnabled !== 'boolean') return 'adsEnabled must be a boolean';
  if (!Object.hasOwn(body, 'adScripts')) return null;
  if (!body.adScripts || typeof body.adScripts !== 'object' || Array.isArray(body.adScripts)) return 'adScripts must be an object';
  for (const [key, value] of Object.entries(body.adScripts)) {
    if (!slots.includes(key)) return 'Unknown advertisement slot';
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.provider !== 'adsense' || typeof value.client !== 'string' || typeof value.slot !== 'string' || !/^ca-pub-\d{16}$/.test(value.client) || !/^\d{10}$/.test(value.slot)
        || Object.keys(value).some((k) => !['provider', 'client', 'slot'].includes(k))) return 'AdSense requires a valid ca-pub publisher ID and 10-digit ad unit ID';
      continue;
    }
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 32768) return 'Ad HTML must be a string of at most 32 KB per slot';
  }
  if (new Set(Object.values(body.adScripts).filter((v) => v?.provider === 'adsense').map((v) => v.client)).size > 1) return 'Use the same AdSense publisher for all slots';
  return null;
}

function createAdSettingsStore(directory) {
  const file = path.join(directory, 'ads.json');
  return {
    load() {
      if (!fs.existsSync(file)) return null;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const error = validateAdSettings(data);
      if (error) throw new Error(error);
      return data;
    },
    save(settings) {
      const data = { adsEnabled: settings.adsEnabled, adScripts: settings.adScripts };
      const error = validateAdSettings(data);
      if (error) throw new Error(error);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
    },
  };
}
module.exports = { validateAdSettings, createAdSettingsStore };

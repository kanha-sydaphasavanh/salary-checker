import { existsSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { resolve as _resolve } from 'path';
import axios from 'axios';
import { AuthType, createClient } from 'webdav';
import 'dotenv/config';

const now = new Date();
const DATE = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const TIME = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
const DATETIME = `${DATE} ${TIME}`;
const AUTH_TOKEN = process.env.ILUCCA_AUTH_TOKEN;
const __dirname = _resolve()

const api_ilucca = axios.create({
    baseURL: 'https://sivecogroup.ilucca.net/payslip/api/payslips',
    headers: {
        'Cookie': `_BEAMER_USER_ID_xWDIXXVd32349=${process.env.ILUCCA_BEAMER_USER_ID}; _BEAMER_FIRST_VISIT_xWDIXXVd32349=${now.toISOString()}; authToken=${AUTH_TOKEN}; _dd_s=rum=0`,
        'Content-Type': 'application/json'
    }
});

const api_discord = axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://discord.com/developers/docs/intro)'
    }
})

const webdavClient = createClient(process.env.NEXTCLOUD_WEBDAV_BASE_URL, {
    authType: AuthType.BASIC,
    username: process.env.NEXTCLOUD_ADMIN_USER,
    password: process.env.NEXTCLOUD_ADMIN_PASSWORD,
});

const STATE_FILE = _resolve(__dirname, 'state.json');
const loadState = () => {
    try {
        if (existsSync(STATE_FILE)) {
            const data = readFileSync(STATE_FILE, 'utf8').trim();
            if (!data) {
                // Fichier vide
                return { lastLength: 0 };
            }
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Erreur lecture fichier état ou JSON invalide :', err);
    }
    // Si fichier inexistant ou erreur JSON
    return { lastLength: 0 };
}

const saveState = (state) => {
    try {
        writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        console.error('Erreur écriture fichier état :', err);
    }
}

let state = loadState();
(async () => {
    try {
        const response = await api_ilucca.get(`/mine?limit=1000`);

        const items = response.data.items;
        if (!Array.isArray(items)) {
            console.error(DATETIME + ' - Réponse inattendue :', response.data);
            return;
        }

        console.log(`${DATETIME} - Nombre de fiches de paie : ${items.length}`);

        if (items.length > state.lastLength) {

            const firstId = items[0].id;
            const payload = {
                ids: [firstId],
                token: '',
            };

            const downloadResponse = await api_ilucca.post(`/download`, payload, { responseType: 'stream', });

            if (downloadResponse.status !== 200) {
                console.error(`${DATETIME} - Erreur lors du téléchargement :`, downloadResponse.statusText);
                return;
            }

            let fileName = downloadResponse.headers['content-disposition'].match(/filename="(.+?)"/)[1];
            fileName = formatFilename(fileName);

            saveState({ lastLength: items.length });
            // const writer = createWriteStream(filePath);

            try {
                // convert into a buffer
                const chunks = [];
                for await (const chunk of downloadResponse.data) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                const filePath = `${process.env.NEXTCLOUD_WEBDAV_PATH_TARGET}/${fileName}`;
                await webdavClient.putFileContents(filePath, buffer);

                console.log(`${DATETIME} - Nouvelle fiche détectée, id : ${firstId} - ${fileName}`);
                console.log(`${DATETIME} - Fichier téléchargé et sauvegardé : ${filePath}`);
            } catch (error) {
                console.error(`${DATETIME} - Erreur lors de l'envoi vers WebDAV :`, error);
            }

            const ALLOW_DISCORD = process.env.ALLOW_DISCORD_NOTIFICATIONS === "true";

            if (ALLOW_DISCORD) {
                api_discord.post(`/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
                    content: `\u{1F4B8}\u{1F4B8} - Nouvelle fiche de paie arrivé : ${fileName}.`,
                });
            }

            // await new Promise((resolve, reject) => {
            //     writer.on('finish', resolve);
            //     writer.on('error', reject);
            // });


            // Reset state en mémoire
            state = { lastLength: 0 };
        } else {
            console.log(`${DATETIME} - Pas de nouvelle fiche de paie.`);
        }
    } catch (error) {
        console.error(`${DATETIME} - Erreur lors de la vérification des fiches de paie :`, error.stack || error.message || error);
    }
}
)().catch(err => {
    console.error(`${DATETIME} - Erreur inattendue :`, err.stack || err.message || err);
});

const formatFilename = (filename) => {
    const match = filename.match(/^(\d{4}-\d{2}) - ([^-]+) - [^-]+ - ([a-zéûîôàèùç]+ \d{4})\.pdf$/i);
    if (match) {
        const [, yearMonth, name, monthYear] = match;
        // Capitalize the first letter of the month
        const formattedMonthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
        return `${yearMonth} - ${name} - ${formattedMonthYear}.pdf`;
    }
    return filename;
}
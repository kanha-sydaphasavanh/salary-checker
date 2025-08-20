import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve as _resolve } from 'path';
import 'dotenv/config'; // Only for dev mode
import { getDateTime, formatFilename,logEnvInfo } from './utils.js';
import { NextcloudWebdav } from './NextcloudWebdav.js';
import { DiscordBotApi } from './DiscordBotApi.js';
import { IluccaApi } from './IlluccaApi.js';

const DATETIME = getDateTime();
const __dirname = _resolve();
const STATE_FILE = _resolve(__dirname, 'state.json');

logEnvInfo();

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
        const api_ilucca = new IluccaApi();
        const response = await api_ilucca.getPayslips();

        const items = response.items;
        if (!Array.isArray(items)) {
            console.error(`[${DATETIME}] - Réponse inattendue de l'API : items n'est pas un tableau.`, response.data || response);
            return;
        }

        console.log(`[${DATETIME}] - Nombre de fiches de paie : ${items.length}`);

        if (items.length > state.lastLength) {

            const firstId = items[0].id;
            const payload = {
                ids: [firstId],
                token: '',
            };

            const downloadResponse = await api_ilucca.downloadPayslip(payload);
            if (downloadResponse.status !== 200) {
                console.error(`[${DATETIME}] - Erreur lors du téléchargement :`, downloadResponse.statusText);
                return;
            }
            
            const fileName = formatFilename(downloadResponse.headers['content-disposition'].match(/filename="(.+?)"/)[1]);
            console.log(`[${DATETIME}] - Nouvelle fiche détectée, id : ${firstId} - Nom du fichier : ${fileName}`);

            saveState({ lastLength: items.length });

            try {
                // convert into a buffer
                const chunks = [];
                for await (const chunk of downloadResponse.data) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                const filePath = `${process.env.NEXTCLOUD_WEBDAV_PATH_TARGET}/${fileName}`;
                const webdavClient = new NextcloudWebdav();
                await webdavClient.uploadFile(filePath, buffer);

                console.log(`[${DATETIME}] - Fichier téléchargé et sauvegardé : ${filePath}`);
            } catch (error) {
                console.error(`[${DATETIME}] - Erreur lors de l'envoi vers WebDAV :`, error);
            }

            const ALLOW_DISCORD = process.env.ALLOW_DISCORD_NOTIFICATIONS === "true";

            if (ALLOW_DISCORD) {
                const discordBotApi = new DiscordBotApi();
                await discordBotApi.sendMessage(process.env.DISCORD_CHANNEL_ID, `\u{1F4B8}\u{1F4B8} - Nouvelle fiche de paie arrivé : ${fileName}.`);
            }



            // Reset state en mémoire
            state = { lastLength: 0 };
        } else {
            console.log(`[${DATETIME}] - Pas de nouvelle fiche de paie.`);
        }
    } catch (error) {
        console.error(`[${DATETIME}] - Erreur lors de la vérification des fiches de paie :`, error.stack || error.message || error);
    }
}
)().catch(err => {
    console.error(`[${DATETIME}] - Erreur inattendue :`, err.stack || err.message || err);
});

const fs = require('fs');
const path = require('path');
const axios = require('axios')
// require('dotenv').config();

const now = new Date();
const DATE = now.toLocaleDateString('fr-FR');
const TIME = now.toLocaleTimeString('fr-FR');
const DATETIME = `${DATE} ${TIME}`;
const AUTH_TOKEN = process.env.ILUCCA_AUTH_TOKEN;

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

const STATE_FILE = path.resolve(__dirname, 'state.json');
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8').trim();
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

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
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

            const downloadResponse = await api_ilucca.post(`/download`,
                payload,
                {
                    responseType: 'stream',
                }
            );

            if (downloadResponse.status !== 200) {
                console.error(`${DATETIME} - Erreur lors du téléchargement :`, downloadResponse.statusText);
                return;
            }
            const fileName = downloadResponse.headers['content-disposition'].match(/filename="(.+?)"/)[1];
            const filePath = path.resolve(__dirname, 'data', fileName);
            const writer = fs.createWriteStream(filePath);
            saveState({ lastLength: items.length });
            
            console.log(`${DATETIME} - Nouvelle fiche détectée, id : ${firstId} - ${fileName}`);
            console.log(`${DATETIME} - Fichier téléchargé et sauvegardé : ${filePath}`);
            downloadResponse.data.pipe(writer);

            if(process.env.ALLOW_DISCORD_NOTIFICATIONS) {
                api_discord.post(`/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
                    content: `\u{1F4B8}\u{1F4B8} - Nouvelle fiche de paie arrivé : ${fileName}.`,
                });
            }

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Suppression du fichier state.json
            // try {
            //     if (fs.existsSync(STATE_FILE)) {
            //         fs.unlinkSync(STATE_FILE);
            //         console.log('Fichier state.json supprimé.');
            //     }
            // } catch (err) {
            //     console.error('Erreur lors de la suppression du fichier state.json :', err);
            // }

            // Reset state en mémoire
            state = { lastLength: 0 };
        } else {

            console.log(`${DATETIME} - Pas de nouvelle fiche de paie.`);
        }
    } catch (error) {
        console.error(`${DATETIME} - Erreur lors de la vérification des fiches de paie :`, error.message);
    }
}
)().catch(err => {
    console.error(`${DATETIME} - Erreur inattendue :`, err.message);
});
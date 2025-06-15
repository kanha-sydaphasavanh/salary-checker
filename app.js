const fs = require('fs');
const path = require('path');
const axios = require('axios')
const baseURL = 'https://sivecogroup.ilucca.net/payslip/api/payslips'

const headers = {
    'Cookie': `_BEAMER_USER_ID_xWDIXXVd32349=da4b654f-42ae-485d-b75b-a705f533fd98; _BEAMER_FIRST_VISIT_xWDIXXVd32349=${new Date().toISOString()}; authToken=c08b6d12-ced1-4ab1-b29a-38923fc57f67; _dd_s=rum=0^&expire=1748596913018`,
    'Content-Type': 'application/json'
}
const AUTH_TOKEN = '';
const STATE_FILE = path.resolve(__dirname, 'state.json');
const now = new Date();
const dateStr = now.toLocaleDateString('fr-FR');
const timeStr = now.toLocaleTimeString('fr-FR');
const dateTimeStr = `${dateStr} ${timeStr}`;

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
        const response = await axios.get(`${baseURL}/mine?limit=1000`, {
            headers,
        });

        const items = response.data.items;
        if (!Array.isArray(items)) {
            console.error(dateTimeStr + ' - Réponse inattendue :', response.data);
            return;
        }

        console.log(`${dateTimeStr} - Nombre de fiches de paie : ${items.length}`);

        if (items.length > state.lastLength) {
            const firstId = items[0].id;
            const payload = {
                ids: [firstId],
                token: AUTH_TOKEN,
            };

            const downloadResponse = await axios.post(
                `${baseURL}/download`,
                payload,
                {
                    headers,
                    responseType: 'stream',
                }
            );
            
            if (downloadResponse.status !== 200) {
                console.error(`${dateTimeStr} - Erreur lors du téléchargement :`, downloadResponse.statusText);
                return;
            }
            const fileName = downloadResponse.headers['content-disposition'].match(/filename="(.+?)"/)[1];
            const filePath = path.resolve(__dirname,'data', fileName);
            const writer = fs.createWriteStream(filePath);
            saveState({ lastLength: items.length });
            console.log(`${dateTimeStr} - Nouvelle fiche détectée, id : ${firstId} - ${fileName}`);
            console.log(`${dateTimeStr} - Fichier téléchargé et sauvegardé : ${filePath}`);

            downloadResponse.data.pipe(writer);
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

            console.log(`${dateTimeStr} - Pas de nouvelle fiche de paie.`);
        }
    } catch (error) {
        console.error(`${dateTimeStr} - Erreur lors de la vérification des fiches de paie :`, error.message);
    }
}
)().catch(err => {
    console.error(`${dateTimeStr} - Erreur inattendue :`, err.message);
});
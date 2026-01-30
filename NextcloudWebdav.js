import { createClient, AuthType } from 'webdav';
import 'dotenv/config';
import { getDateTime } from './utils.js';

export class NextcloudWebdav {
    constructor() {

        this.client = createClient(process.env.NEXTCLOUD_WEBDAV_BASE_URL, {
            authType: AuthType.BASIC,
            username: process.env.NEXTCLOUD_ADMIN_USER,
            password: atob(process.env.NEXTCLOUD_ADMIN_PASSWORD),
            headers: {
                'Host': process.env.NEXTCLOUD_EXTERNAL_HOST || 'localhost',
            },
        });
    }

    async uploadFile(filePath, content) {
        try {
            await this.client.putFileContents(filePath, content);
        } catch (error) {
            console.error(`[${getDateTime()}] - Error uploading file to Nextcloud WebDAV:`, error || error.message);
            throw error;
        }
    }
}
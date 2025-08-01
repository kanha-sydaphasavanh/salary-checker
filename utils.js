export const getDateTime = () => {
    const now = new Date();
    const DATE = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
    const TIME = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
    return `${DATE} ${TIME}`;
};

const getDateTime = () => {
    const now = new Date();
    const DATE = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
    const TIME = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
    return `${DATE} ${TIME}`;
};

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

const logEnvInfo = () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Using .env file to supply config environment variables');
    }
}

export { getDateTime, formatFilename, logEnvInfo };
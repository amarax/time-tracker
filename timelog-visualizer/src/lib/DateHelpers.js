/** 
 *  Set the start date to the Monday of the current week
 * @param {Date} date - The input date
 * @returns {Date} - The adjusted date set to Monday
 */
export function setStartDateToMonday(date) {
    const day = date.getDay();
    // Calculate how many days to subtract to get to Monday (0 for Monday, 1 for Tuesday, ..., 6 for Sunday)
    const diff = (day + 6) % 7;
    let newDate = new Date(date);
    newDate.setDate(date.getDate() - diff);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
}

/**
 * Format a date as a string.
 * @param {Date|null|undefined} date - The input date
 * @returns {string} - The formatted date string
 */
export function formatDate(date) {
    if (!date) {
        return '';
    }
    
    return date.toLocaleDateString('en-SG', {
        month: 'short',
        day: 'numeric'
    });
}
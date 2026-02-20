const { ImapFlow } = require('imapflow');
console.log('We can guess the sent folder by iterating over client.listMailboxes()');
console.log('and checking if it has \\\\Sent in its specialUse flags.');

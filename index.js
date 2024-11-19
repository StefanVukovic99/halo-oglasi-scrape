const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');

async function processWebpage() {
  try {
    const memoryData = await fs.readFile('memory.json', 'utf8');
    const memory = JSON.parse(memoryData);
    memory.time = new Date().toISOString();

    if (!memory.target) {
      throw new Error('No target URL specified in memory.json');
    }

    const response = await axios.get(memory.target);
    const html = response.data;

    const $ = cheerio.load(html);

    const productLinks = $('.product-title a').map((i, el) => $(el).attr('href')).get().map((rel_link => 'https://www.halooglasi.com' + rel_link));
    productLinks.forEach((link) => {
        if (!['new', 'seen', 'removed'].some((status) => memory[status].includes(link))) {
            memory.new.push(link);
            return;
        }

    });

    [...memory.new, ...memory.seen].forEach((knownLink) => {
        if(!productLinks.includes(knownLink)) {
            memory.new = memory.new.filter((link) => link !== knownLink);
            memory.seen = memory.seen.filter((link) => link !== knownLink);
            memory.removed.push(knownLink);
        }
    });

    await fs.writeFile('memory.json', JSON.stringify(memory, null, 2));

    console.log('Web page processed successfully');
  } catch (error) {
    console.error('Error processing webpage:', error.message);
    
    try {
      const memoryData = await fs.readFile('memory.json', 'utf8');
      const memory = JSON.parse(memoryData);
      memory.error = error.message;
      await fs.writeFile('memory.json', JSON.stringify(memory, null, 2));
    } catch (writeError) {
      console.error('Could not write error to memory.json', writeError);
    }
  }
}

processWebpage();
// */10 * * * * /home/stefan/.nvm/versions/node/v20.10.0/bin/node /home/stefan/dev/sandbox/halo-oglasi-scrape/index.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');

const SCRIPT_DIR = '/home/stefan/dev/sandbox/halo-oglasi-scrape';
const MEMORY_FILE = path.join(SCRIPT_DIR, 'memory.json');

async function sendDiscord(newLinks, webhookUrl, userId) {
  try {
    return await axios.post(webhookUrl, {
      content: `New listings found:\n${newLinks.join('\n')}\n\n<@${userId}>`
    });
  } catch (error) {
    console.error('Error sending Discord notification:', error.message);
  }
}

async function sendEmail(newLinks, emailConfig) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailConfig.email,
        pass: emailConfig.password
      }
    });

    const mailOptions = {
      from: emailConfig.email,
      to: emailConfig.email,
      subject: 'New Halo Oglasi Links',
      text: `New links found:\n\n${newLinks.join('\n')}`
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Email sending error:', error);
  }
}

async function processTarget(target, url) {
  switch (target) {
    case 'Halo Oglasi':
      return await processHaloOglasi(url);
    case '4zida':
      return await process4zida(url);
    default:
      throw new Error(`Unknown target: ${target}`);
  }
}

async function processHaloOglasi(url) {
  const response = await axios.get(url);
  const html = response.data;

  const $ = cheerio.load(html);

  return $('.product-title a').map((i, el) => $(el).attr('href')).get().map((rel_link) => 'https://www.halooglasi.com' + rel_link);
}

async function process4zida(url) {
  const response = await axios.get(url);
  const html = response.data;

  const $ = cheerio.load(html);

  return $('[test-data="ad-search-card"] > div:first-child >a').map((i, el) => $(el).attr('href')).get().map((rel_link) =>  'https://www.4zida.rs/' + rel_link);
}

async function processWebpage() {
  try {
    // Use absolute path for logging
    const logFile = path.join(SCRIPT_DIR, 'scraper.log');

    // Ensure script is running from the correct directory
    process.chdir(SCRIPT_DIR);

    const memoryData = await fs.readFile(MEMORY_FILE, 'utf8');
    const memory = JSON.parse(memoryData);
    memory.time = new Date().toISOString();
    
    if (!memory.targets) {
      throw new Error('No targets URL specified in memory.json');
    }

    let processedTargets = 0;
    const newLinksToNotify = [];
    const currentLinks = [];

    for (const [target, url] of Object.entries(memory.targets)) {
      try {
        const productLinks = await processTarget(target, url);
        productLinks.forEach((link) => {
          if (!['new', 'seen', 'removed'].some((status) => memory[status].includes(link))) {
              memory.new.push(link);
              newLinksToNotify.push(link);
          }
        });
        currentLinks.push(...productLinks);
        processedTargets+=1;
      } catch (error) {
        console.error(`Error processing target ${target}:`, error.message);
      }
    }

    if (newLinksToNotify.length > 0 && memory.email) {
      await sendEmail(newLinksToNotify, memory.email);
      await sendDiscord(newLinksToNotify, memory.discord.webhook, memory.discord.user_id);
    }

    [...memory.new, ...memory.seen].forEach((knownLink) => {
        if(!currentLinks.includes(knownLink)) {
            memory.new = memory.new.filter((link) => link !== knownLink);
            memory.seen = memory.seen.filter((link) => link !== knownLink);
            memory.removed.push(knownLink);
        }
    });

    await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));

    // Optional: Append successful run to log file
    await fs.appendFile(
      logFile, 
      `${new Date().toISOString()} ${processedTargets} targets ${currentLinks.length} links\n`
    );

    console.log('Web page processed successfully');
  } catch (error) {
    // Log errors to a file instead of just console
    const logFile = path.join(SCRIPT_DIR, 'error.log');
    
    try {
      await fs.appendFile(logFile, `Error at ${new Date().toISOString()}: ${error.message}\n`);
      
      const memoryData = await fs.readFile(MEMORY_FILE, 'utf8');
      const memory = JSON.parse(memoryData);
      memory.error = error.message;
      await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
    } catch (writeError) {
      // Fallback error logging
      await fs.appendFile(logFile, `Critical error: Could not write error details - ${writeError.message}\n`);
    }

    console.error('Error processing webpage:', error.message);
  }
}

processWebpage();
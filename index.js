const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');

const SCRIPT_DIR = '/home/stefan/dev/sandbox/halo-oglasi-scrape';
const MEMORY_FILE = path.join(SCRIPT_DIR, 'memory.json');

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

async function processWebpage() {
  try {
    // Use absolute path for logging
    const logFile = path.join(SCRIPT_DIR, 'scraper.log');

    // Ensure script is running from the correct directory
    process.chdir(SCRIPT_DIR);

    const memoryData = await fs.readFile(MEMORY_FILE, 'utf8');
    const memory = JSON.parse(memoryData);
    memory.time = new Date().toISOString();

    if (!memory.target) {
      throw new Error('No target URL specified in memory.json');
    }

    const response = await axios.get(memory.target);
    const html = response.data;

    const $ = cheerio.load(html);

    const productLinks = $('.product-title a').map((i, el) => $(el).attr('href')).get().map((rel_link) => 'https://www.halooglasi.com' + rel_link);
    
    const newLinksToNotify = [];
    productLinks.forEach((link) => {
        if (!['new', 'seen', 'removed'].some((status) => memory[status].includes(link))) {
            memory.new.push(link);
            newLinksToNotify.push(link);
        }
    });

    // Send email if new links found
    if (newLinksToNotify.length > 0 && memory.email) {
      await sendEmail(newLinksToNotify, memory.email);
    }

    [...memory.new, ...memory.seen].forEach((knownLink) => {
        if(!productLinks.includes(knownLink)) {
            memory.new = memory.new.filter((link) => link !== knownLink);
            memory.seen = memory.seen.filter((link) => link !== knownLink);
            memory.removed.push(knownLink);
        }
    });

    await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));

    // Optional: Append successful run to log file
    await fs.appendFile(logFile, `Processed successfully at ${new Date().toISOString()}\n`);

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
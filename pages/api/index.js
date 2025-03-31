import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import csvParser from 'csv-parser';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Failed to parse form data' });

        const question = fields.question;
        if (!question) return res.status(400).json({ error: 'Missing question field' });

        let extractedContent = '';

        if (files.file) {
            try {
                const filePath = files.file.filepath || files.file.path;
                const fileName = files.file.originalFilename || files.file.newFilename || files.file.name;
                const fileExtension = path.extname(fileName).toLowerCase();

                const tempDir = path.join('/tmp', 'extract_' + Date.now());
                fs.mkdirSync(tempDir, { recursive: true });

                if (fileExtension === '.zip') {
                    await new Promise((resolve, reject) => {
                        fs.createReadStream(filePath)
                            .pipe(unzipper.Extract({ path: tempDir }))
                            .on('close', resolve)
                            .on('error', reject);
                    });
                } else {
                    fs.copyFileSync(filePath, path.join(tempDir, fileName));
                }

                const filesInDir = fs.readdirSync(tempDir);
                const csvFile = filesInDir.find(f => f.endsWith('.csv'));

                if (csvFile) {
                    const csvPath = path.join(tempDir, csvFile);
                    extractedContent = await new Promise((resolve, reject) => {
                        const results = [];
                        fs.createReadStream(csvPath)
                            .pipe(csvParser())
                            .on('data', row => results.push(row))
                            .on('end', () => resolve(JSON.stringify(results)))
                            .on('error', reject);
                    });
                }
            } catch (err) {
                console.error(err);
                return res.status(500).json({ error: 'File processing error' });
            }
        }

        const prompt = extractedContent ? `${question}\n\nExtracted file content: ${extractedContent}\n\nRespond with only a single numeric answer.` : `${question}\n\nRespond with only a single numeric answer.`;

        try {
            const completionRes = await fetch(process.env.AI_PROXY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.AI_PROXY_TOKEN}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.0,
                })
            });

            const data = await completionRes.json();
            const answer = data.choices?.[0]?.message?.content?.trim().match(/\d+/)?.[0] || 'No numeric answer returned';
            return res.status(200).json({ answer });
        } catch (apiErr) {
            console.error(apiErr);
            return res.status(500).json({ error: 'AI API call failed' });
        }
    });
}

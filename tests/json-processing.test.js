const fs = require('fs');
const path = require('path');

async function run() {
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = await fetch('https://rxresu.me/schema.json').then((r) => r.json());

  const validate = ajv.compile(schema);

  const resumeDataPath = path.join(__dirname, '..', 'resume', 'Reactive Resume.json');
  const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, 'utf8'));

  const isValid = validate(resumeData);
  if (!isValid) {
    console.error(validate.errors);
    process.exit(1);
  }

  console.log('PASS schema validation succeeded');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

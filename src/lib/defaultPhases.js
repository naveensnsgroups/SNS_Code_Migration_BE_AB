// Mirrors MIGRATION_PHASES in SNS_Code_Migration_FE/types/index.ts — must stay
// in sync (same ids/labels/order) since the frontend keys its pipeline stepper
// off phase id.
// 'scan' starts 'pending', not 'done' — a plain file upload isn't real stack
// detection. It's the Scanner Agent's job (the external AgentBuilder webhook)
// to actually detect language/framework/database and flip this to 'done'
// once it writes detectedStack back to the session.
const DEFAULT_PHASES = [
  { id: 'scan', label: 'Stack Detection', status: 'pending' },
  { id: 'discovery', label: 'Discovery', status: 'pending' },
  { id: 'file-analysis', label: 'File Analysis', status: 'pending' },
  { id: 'graph-resolution', label: 'Graph Resolution', status: 'pending' },
  { id: 'section-writing', label: 'Section Writing', status: 'pending' },
  { id: 'assembly', label: 'Assembly', status: 'pending' },
  { id: 'migration-planning', label: 'Migration Planning', status: 'pending' },
  { id: 'code-generation', label: 'Code Generation', status: 'pending' },
  { id: 'verification', label: 'Verification', status: 'pending' },
  { id: 'migration-assembly', label: 'Migration Report', status: 'pending' },
];

module.exports = DEFAULT_PHASES;

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const internships = require('../../database/internships.json');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function seed() {
  console.log('🔗 Connecting to Supabase...');
  const { error: del } = await supabase.from('internships').delete().neq('id','');
  if (del) { console.error('Delete error:', del.message); return; }
  console.log('🗑️  Cleared old internships');
  const { data, error } = await supabase.from('internships').insert(internships).select();
  if (error) { console.error('Insert error:', error.message); return; }
  console.log(`\n🌱 Seeded ${data.length} internships!\n`);
  data.forEach((i,idx) => console.log(`  ${idx+1}. [${i.id}] ${i.title} @ ${i.company}`));
  console.log('\n✅ Done!');
}
seed();

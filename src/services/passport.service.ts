import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../config/supabase';

export async function generateHealthPassport(userId: string): Promise<Buffer> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  const { data: donations } = await supabaseAdmin
    .from('donations')
    .select('donation_date, hospital_name, blood_type, units, component')
    .eq('donor_id', userId)
    .order('donation_date', { ascending: false })
    .limit(50);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).text('BloodLink — Donor Health Passport', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Name: ${user?.name ?? '—'}`);
    doc.text(`Blood type: ${user?.blood_type ?? '—'}`);
    doc.text(`Total donations: ${user?.total_donations ?? 0}`);
    doc.text(`Points: ${user?.points ?? 0}`);
    doc.text(`Verified: ${user?.is_verified ? 'Yes' : 'No'}`);
    if (user?.last_donation_at) doc.text(`Last donation: ${user.last_donation_at}`);
    if (user?.next_eligible_at) doc.text(`Next eligible: ${user.next_eligible_at}`);

    doc.moveDown();
    doc.fontSize(14).text('Donation history', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    (donations ?? []).forEach((d) => {
      doc.text(
        `${d.donation_date} · ${d.hospital_name} · ${d.blood_type} · ${d.units} unit(s) · ${d.component}`
      );
    });
    if (!donations?.length) doc.text('No recorded donations yet.');

    doc.end();
  });
}

import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';

export async function awardDonationPoints(donorId: string, points = env.POINTS_PER_DONATION) {
  const { error } = await supabaseAdmin.rpc('increment_points', {
    p_user_id: donorId,
    p_points: points,
    p_increment_donations: 1,
  });
  if (error) throw error;
}

export async function awardBonusPoints(userId: string, points: number) {
  const { error } = await supabaseAdmin.rpc('increment_points', {
    p_user_id: userId,
    p_points: points,
    p_increment_donations: 0,
  });
  if (error) throw error;
}

export async function markDonorDonated(donorId: string, at: Date = new Date()) {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ last_donation_at: at.toISOString(), availability: 'cooldown' })
    .eq('id', donorId);
  if (error) throw error;
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createLoan(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autenticado' }
  }

  const debtorName = String(formData.get('debtor_name') ?? '').trim()
  const amount = Number(formData.get('amount') ?? 0)
  const dueDate = String(formData.get('due_date') ?? '')

  if (!debtorName) {
    return { error: 'El nombre del deudor es obligatorio' }
  }

  const { error } = await supabase.from('loans').insert({
    user_id: user.id,
    debtor_name: debtorName,
    amount: Number.isFinite(amount) ? amount : 0,
    due_date: dueDate || null,
    status: 'pending',
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleLoanStatus(id: string, currentStatus: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autenticado' }
  }

  const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid'

  const { error } = await supabase
    .from('loans')
    .update({ status: nextStatus })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteLoan(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('loans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

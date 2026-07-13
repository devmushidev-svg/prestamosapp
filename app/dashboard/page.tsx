import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { LoanForm } from './loan-form'
import { LoanList, type Loan } from './loan-list'
import { signOut } from './actions'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value || 0)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data } = await supabase
    .from('loans')
    .select('*')
    .order('created_at', { ascending: false })

  const loans = (data ?? []) as Loan[]

  const totalPending = loans
    .filter((l) => l.status === 'pending')
    .reduce((sum, l) => sum + Number(l.amount), 0)
  const totalPaid = loans
    .filter((l) => l.status === 'paid')
    .reduce((sum, l) => sum + Number(l.amount), 0)

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              PrestaFácil
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              <LogOut className="mr-1 h-4 w-4" />
              Salir
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Préstamos</p>
              <p className="text-2xl font-semibold text-foreground">
                {loans.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Por cobrar</p>
              <p className="text-2xl font-semibold text-foreground">
                {formatCurrency(totalPending)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Cobrado</p>
              <p className="text-2xl font-semibold text-foreground">
                {formatCurrency(totalPaid)}
              </p>
            </CardContent>
          </Card>
        </div>

        <LoanForm />
        <LoanList loans={loans} />
      </main>
    </div>
  )
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "No tienes permisos de administrador" }, { status: 403 })
    }

    const { email, role } = await request.json()

    if (!email || !role) {
      return NextResponse.json({ error: "Email y rol son requeridos" }, { status: 400 })
    }

    // Check if email already exists in auth users or invitations
    const { data: existingProfile } = await supabase.from("profiles").select("email").eq("email", email).single()

    if (existingProfile) {
      return NextResponse.json({ error: "Este correo ya está registrado" }, { status: 400 })
    }

    // Check if there's a pending invitation
    const { data: existingInvitation } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("email", email)
      .eq("status", "pending")
      .single()

    if (existingInvitation) {
      return NextResponse.json({ error: "Ya existe una invitación pendiente para este correo" }, { status: 400 })
    }

    // Create invitation record
    const { error: inviteError } = await supabase.from("user_invitations").insert({
      email,
      role,
      invited_by: user.id,
    })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    // Send invitation email using Supabase Auth Admin
    const adminClient = getAdminClient()
    const redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://login-umber-kappa.vercel.app"}/auth/callback`

    const { error: emailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: {
        role,
      },
    })

    if (emailError) {
      // Delete the invitation record if email fails
      await supabase.from("user_invitations").delete().eq("email", email)
      return NextResponse.json({ error: emailError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Invitación enviada correctamente" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Error al enviar invitación" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Check if user is admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "No tienes permisos de administrador" }, { status: 403 })
    }

    // Get all invitations
    const { data: invitations, error } = await supabase
      .from("user_invitations")
      .select("*")
      .order("invited_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invitations })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Error al obtener invitaciones" }, { status: 500 })
  }
}

import LoginForm from '../components/auth/LoginForm'

export default function Login() {
  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <LoginForm />
      </div>
    </div>
  )
}

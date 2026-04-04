import type { Metadata } from 'next'
import Providers from './components/providers'

export const metadata: Metadata = {
  title: 'ClientBloom — Market Intelligence',
  description: 'Social listening dashboard for ClientBloom.ai',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com" async={false} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      brand: { 500: '#4F6BFF', 600: '#3D57F5' }
                    }
                  }
                }
              }
            `
          }}
        />
        <style dangerouslySetInnerHTML={{__html: `
          body { background-color: #0a0c10; color: #e2e8f0; margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
          * { box-sizing: border-box; }
        `}} />
      </head>
      <body className="min-h-screen bg-[#0a0c10] text-slate-200 antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

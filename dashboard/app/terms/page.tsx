import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Scout by ClientBloom',
  description: 'Terms governing your use of Scout by ClientBloom, the LinkedIn relationship intelligence platform.',
  openGraph: {
    title: 'Terms of Service — Scout by ClientBloom',
    url: 'https://scout.clientbloom.ai/terms',
  },
}

export default function TermsOfService() {
  const lastUpdated = 'April 7, 2026'

  return (
    <div className="min-h-screen bg-[#0A0C14] text-slate-300">
      <nav className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-white font-bold tracking-tight">
            Scout <span className="text-slate-400 font-normal text-sm">by ClientBloom</span>
          </Link>
          <Link href="/sign-in" className="text-slate-400 hover:text-slate-200 text-sm transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-3">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-12">Last updated: {lastUpdated}</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-10 text-slate-300 leading-relaxed">

          <section>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Scout by ClientBloom (&ldquo;Scout,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), operated by BrightLink Consulting. By creating an account or using the Service at scout.clientbloom.ai, you agree to be bound by these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. The Service</h2>
            <p>Scout is a LinkedIn relationship intelligence platform that monitors publicly available LinkedIn activity for profiles and keywords you specify, scores posts for relevance to your ideal customer profile using AI, and generates personalized comment starters to help you build relationships before pitching.</p>
            <p className="mt-4">Scout is designed for legitimate professional relationship-building and B2B sales development. It is not a mass outreach tool, a spam tool, or a data harvesting service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Accounts and Eligibility</h2>
            <p>You must be at least 18 years old and legally able to form a binding contract to use the Service. By creating an account, you represent that all information you provide is accurate and that you will maintain the accuracy of that information.</p>
            <p className="mt-4">You are responsible for maintaining the security of your account credentials. Notify us immediately at <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a> if you suspect unauthorized access to your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Subscriptions and Billing</h2>
            <p>Scout is offered as a monthly subscription at $79/month (or as otherwise displayed at the time of purchase). Subscriptions are billed monthly in advance via Stripe.</p>
            <ul className="list-disc list-inside space-y-2 mt-4 text-slate-300">
              <li>Your subscription renews automatically each month until cancelled</li>
              <li>You may cancel at any time from your account settings; cancellation takes effect at the end of the current billing period</li>
              <li>We do not offer prorated refunds for partial billing periods</li>
              <li>Failed payments will result in a suspension of your account; reactivation requires updated payment information</li>
              <li>We reserve the right to change pricing with 30 days&apos; notice to existing subscribers</li>
            </ul>
            <p className="mt-4">All payments are processed by Stripe. We do not store your full payment card details. By subscribing, you agree to <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer" className="text-[#4F6BFF] hover:underline">Stripe&apos;s Terms of Service</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Acceptable Use</h2>
            <p className="mb-4">You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>Use Scout to collect data for purposes other than your own professional outreach and relationship-building</li>
              <li>Attempt to scrape, export, or bulk-download data from the Service beyond normal use</li>
              <li>Use Scout-generated content to send spam, unsolicited bulk messages, or deceptive communications</li>
              <li>Circumvent LinkedIn&apos;s Terms of Service or platform restrictions</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the Service</li>
              <li>Use the Service in any way that violates applicable local, state, national, or international law</li>
              <li>Resell, sublicense, or otherwise commercialize access to the Service without our written consent</li>
            </ul>
            <p className="mt-4">We reserve the right to suspend or terminate accounts that violate this section without refund.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. LinkedIn and Third-Party Platform Compliance</h2>
            <p>Scout monitors publicly available LinkedIn content on your behalf using Apify, a third-party data provider. You are solely responsible for ensuring your use of Scout-generated content complies with LinkedIn&apos;s User Agreement and Professional Community Policies, as well as any other platform&apos;s terms where you engage with that content.</p>
            <p className="mt-4">BrightLink Consulting and Scout are not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Intellectual Property</h2>
            <p>The Service, including its design, code, features, and branding, is owned by BrightLink Consulting and protected by applicable intellectual property laws. These Terms do not grant you any rights to use our trademarks, logos, or branding.</p>
            <p className="mt-4">Content you enter into Scout (LinkedIn URLs, keyword configurations, custom scoring prompts) remains yours. You grant us a limited license to process that content solely to provide the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. AI-Generated Content</h2>
            <p>Scout uses Anthropic&apos;s Claude AI to generate post scores and comment starters. AI-generated content is provided for informational and creative assistance purposes only. You are solely responsible for reviewing, editing, and deciding whether to use any AI-generated content. We make no guarantees about the accuracy, appropriateness, or effectiveness of AI-generated outputs.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.</p>
            <p className="mt-4">LinkedIn data availability is dependent on third-party providers. We do not guarantee completeness, accuracy, or timeliness of LinkedIn data returned by the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, BRIGHTLINK CONSULTING AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST DATA, OR LOSS OF GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.</p>
            <p className="mt-4">OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE THREE MONTHS PRECEDING THE CLAIM.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Indemnification</h2>
            <p>You agree to indemnify and hold harmless BrightLink Consulting, its affiliates, and their respective officers, employees, and agents from any claims, liabilities, damages, or expenses (including reasonable attorney&apos;s fees) arising from your use of the Service, your violation of these Terms, or your violation of any third-party rights.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">11. Termination</h2>
            <p>We reserve the right to suspend or terminate your access to the Service at any time for any reason, including but not limited to violations of these Terms. You may terminate your account at any time by canceling your subscription and contacting us at <a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">12. Governing Law and Disputes</h2>
            <p>These Terms are governed by the laws of the State of California, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration in California, except that either party may seek injunctive or other equitable relief in a court of competent jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">13. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. Material changes will be communicated via email or a notice on the Service at least 14 days before taking effect. Your continued use of the Service after changes take effect constitutes your acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">14. Contact</h2>
            <p>Questions about these Terms? Contact us at:</p>
            <div className="mt-4 space-y-1 text-slate-300">
              <p className="font-medium text-white">BrightLink Consulting</p>
              <p>Scout by ClientBloom</p>
              <p><a href="mailto:info@clientbloom.ai" className="text-[#4F6BFF] hover:underline">info@clientbloom.ai</a></p>
            </div>
          </section>

        </div>
      </main>

      <footer className="border-t border-slate-800/50 py-8 px-6 mt-16">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <span>© 2026 Scout by ClientBloom. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

import { authProviders, customProviders, isProviderEnabled } from '@zero/server/auth-providers';
import { LoginClient } from './login-client';
import { env } from '@/lib/env';

export default function LoginPage() {
  const envNodeEnv = env.NODE_ENV;
  const isProd = envNodeEnv === 'production';

  const authProviderStatus = authProviders(env as unknown as Record<string, string>).map(
    (provider) => {
      const envVarStatus =
        provider.envVarInfo?.map((envVar) => {
          const envVarName = envVar.name as keyof typeof env;
          return {
            name: envVar.name,
            set: !!env[envVarName],
            source: envVar.source,
            defaultValue: envVar.defaultValue,
          };
        }) || [];

      return {
        id: provider.id,
        name: provider.name,
        enabled: isProviderEnabled(provider, env as unknown as Record<string, string>),
        required: provider.required,
        envVarInfo: provider.envVarInfo,
        envVarStatus,
      };
    },
  );

  const customProviderStatus = customProviders.map((provider) => {
    return {
      id: provider.id,
      name: provider.name,
      enabled: true,
      isCustom: provider.isCustom,
      customRedirectPath: provider.customRedirectPath,
      envVarStatus: [],
    };
  });

  const allProviders = [...customProviderStatus, ...authProviderStatus];

  return (
    <div className="flex min-h-screen w-full flex-col bg-white dark:bg-black">
      <LoginClient providers={allProviders} isProd={isProd} />
    </div>
  );
}

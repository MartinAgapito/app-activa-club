// Fixtures de eventos de API Gateway para pruebas de handlers. Solo se usa
// desde `*.test.ts`; no forma parte del código desplegado a Lambda.

import type {
  APIGatewayEventRequestContextWithAuthorizer,
  APIGatewayProxyCognitoAuthorizer,
  APIGatewayProxyEvent,
  APIGatewayProxyWithCognitoAuthorizerEvent,
} from 'aws-lambda';

interface PartialEventInput {
  httpMethod?: string;
  path?: string;
  body?: string | null;
  headers?: Record<string, string>;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  requestId?: string;
}

interface PartialCognitoEventInput extends PartialEventInput {
  claims?: Record<string, string>;
}

function baseRequestContext<T>(
  authorizer: T,
  requestId: string,
  httpMethod: string,
  path: string,
): APIGatewayEventRequestContextWithAuthorizer<T> {
  return {
    accountId: '123456789012',
    apiId: 'test-api',
    authorizer,
    protocol: 'HTTP/1.1',
    httpMethod,
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: null,
      userArn: null,
    },
    path,
    stage: 'test',
    requestId,
    requestTimeEpoch: Date.now(),
    resourceId: 'test-resource',
    resourcePath: path,
  };
}

/** Evento de API Gateway sin authorizer (rutas públicas, p. ej. `/health`). */
export function buildProxyEvent(input: PartialEventInput = {}): APIGatewayProxyEvent {
  const httpMethod = input.httpMethod ?? 'GET';
  const path = input.path ?? '/';
  const requestId = input.requestId ?? 'test-request-id';
  return {
    body: input.body ?? null,
    headers: input.headers ?? {},
    multiValueHeaders: {},
    httpMethod,
    isBase64Encoded: false,
    path,
    pathParameters: input.pathParameters ?? null,
    queryStringParameters: input.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: baseRequestContext(undefined, requestId, httpMethod, path),
    resource: path,
  };
}

/** Evento de API Gateway autenticado con Cognito Authorizer (rutas `member`/`admin`). */
export function buildCognitoProxyEvent(
  input: PartialCognitoEventInput = {},
): APIGatewayProxyWithCognitoAuthorizerEvent {
  const httpMethod = input.httpMethod ?? 'GET';
  const path = input.path ?? '/';
  const requestId = input.requestId ?? 'test-request-id';
  const claims = input.claims ?? { sub: 'test-sub' };
  const authorizer: APIGatewayProxyCognitoAuthorizer = { claims };
  return {
    body: input.body ?? null,
    headers: input.headers ?? {},
    multiValueHeaders: {},
    httpMethod,
    isBase64Encoded: false,
    path,
    pathParameters: input.pathParameters ?? null,
    queryStringParameters: input.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: baseRequestContext(authorizer, requestId, httpMethod, path),
    resource: path,
  };
}

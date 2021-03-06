import {
    AuthorizationRequestHandler,
    AuthorizationRequest,
    AuthorizationServiceConfiguration,
    AuthorizationRequestResponse,
    StorageBackend,
    LocalStorageBackend,
    BasicQueryStringUtils,
    LocationLike,
    cryptoGenerateRandom,
    AuthorizationResponse,
    AuthorizationError
} from "@openid/appauth";
import { IonicAppBrowserProvider } from '../../auth-service/app-auth/ionicAppBrowser';


/** key for authorization request. */
const authorizationRequestKey =
    (handle: string) => {
        return `${handle}_appauth_authorization_request`;
    }

/** key for authorization service configuration */
const authorizationServiceConfigurationKey =
    (handle: string) => {
        return `${handle}_appauth_authorization_service_configuration`;
    }

/** key in local storage which represents the current authorization request. */
const AUTHORIZATION_REQUEST_HANDLE_KEY = 'appauth_current_authorization_request';
export const AUTHORIZATION_RESPONSE_KEY = "auth_response";

export class IonicAuthorizationRequestHandler extends AuthorizationRequestHandler {

    constructor(  
        // use the provided storage backend
        // or initialize local storage with the default storage backend which
        // uses window.localStorage
        private ionicBrowserView: IonicAppBrowserProvider,
        public storageBackend: StorageBackend = new LocalStorageBackend(),
        utils = new BasicQueryStringUtils(),
        public locationLike: LocationLike = window.location,
        generateRandom = cryptoGenerateRandom,
        ) {

        super(utils, generateRandom);
    }

    public async performAuthorizationRequest(configuration: AuthorizationServiceConfiguration, request: AuthorizationRequest): Promise<any> {
       // this.safariViewController.warmUp();

        let handle = this.generateRandom();

        // before you make request, persist all request related data in local storage.
        let persisted = Promise.all([
            this.storageBackend.setItem(AUTHORIZATION_REQUEST_HANDLE_KEY, handle),
            this.storageBackend.setItem(authorizationRequestKey(handle), JSON.stringify(request.toJson())),
            this.storageBackend.setItem(authorizationServiceConfigurationKey(handle), JSON.stringify(configuration.toJson())),
        ]);

        await persisted;

        //Build the request
        let url = this.buildRequestUrl(configuration, request);

        this.ionicBrowserView.ShowWindow(url);
    }

    protected async completeAuthorizationRequest(): Promise<AuthorizationRequestResponse> {

        let handle = await this.storageBackend.getItem(AUTHORIZATION_REQUEST_HANDLE_KEY);

        if (!handle) {
            //Some error
            return null;
        }

        let authRequestKey = await this.storageBackend.getItem(authorizationRequestKey(handle))
        let json = await JSON.parse(authRequestKey);
        
        let request = await AuthorizationRequest.fromJson(json);

        let response = await this.storageBackend.getItem(AUTHORIZATION_RESPONSE_KEY);
        let parts = response.split('#');

        if (parts.length !== 2) {
            throw new Error("Invalid auth repsonse string");
        }

        //Get the info from the calback URL
        let hash = parts[1];
        let queryParams = this.utils.parseQueryString(hash);

        let state: string | undefined = queryParams['state'];
        let code: string | undefined = queryParams['code'];
        let error: string | undefined = queryParams['error'];

        let authorizationResponse: AuthorizationResponse = null;
        let authorizationError: AuthorizationError = null;

        let shouldNotify = state === request.state;

        if (shouldNotify) {
            if (error) {
                let errorDescription = queryParams['error_description'];
                authorizationError =
                    new AuthorizationError(error, errorDescription, undefined, state);
            } else {
                authorizationResponse = new AuthorizationResponse(code, state!);
            }

            let tasks = new Array<Promise<any>>()
            {
                this.storageBackend.removeItem(AUTHORIZATION_REQUEST_HANDLE_KEY),
                this.storageBackend.removeItem(authorizationRequestKey(handle)),
                this.storageBackend.removeItem(authorizationServiceConfigurationKey(handle))
            };

            await Promise.all(tasks);

            return <AuthorizationRequestResponse>{
                request: request,
                response: authorizationResponse,
                error: authorizationError
            }
        }
    }
}